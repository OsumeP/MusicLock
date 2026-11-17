import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { getStats, type ListeningStats, type StatsPeriod } from '../api/stats'
import { Alert } from '../components/ui'
import { formatDuration, formatListeningTime } from '../lib/format'
import { usePlayer } from '../player/playerContext'
import { DailyPlaysChart } from '../stats/DailyPlaysChart'

/** Periodos (mockup "Tendencias": Top 7 días / Top 30 días / Todo el tiempo). En la URL: ?periodo=. */
const PERIODS: { value: StatsPeriod; param: string; label: string; heading: string }[] = [
  { value: '7d', param: '7', label: '7 días', heading: 'los últimos 7 días' },
  { value: '30d', param: '30', label: '30 días', heading: 'los últimos 30 días' },
  { value: 'all', param: 'todo', label: 'Todo el tiempo', heading: 'todo el tiempo' },
]

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const artistName = (artist: string) => artist || 'Sin artista'

type LoadResult = { key: string; stats: ListeningStats } | { key: string; error: true }

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-surface-card p-5 ring-1 ring-border-subtle">
      <dt className="font-mono text-mono-label uppercase tracking-wider text-on-surface-variant">{label}</dt>
      <dd className="truncate font-display text-headline-sm font-semibold text-on-surface" title={value}>{value}</dd>
      {hint && <dd className="text-body-sm text-on-surface-variant">{hint}</dd>}
    </div>
  )
}

function TopSongs({ stats }: { stats: ListeningStats }) {
  const player = usePlayer()
  const queue = stats.topSongs.map((t) => t.song)
  return (
    <ol className="divide-y divide-border-subtle/60">
      {stats.topSongs.map(({ song, plays }, i) => {
        const isCurrent = player.current?.id === song.id
        const isPlaying = isCurrent && player.status === 'playing'
        return (
          <li key={song.id} className={`flex items-center gap-4 px-5 py-3 ${isCurrent ? 'bg-primary-container/30' : ''}`}>
            <span className="w-6 text-right font-mono text-mono-crypto text-on-surface-variant">{String(i + 1).padStart(2, '0')}</span>
            <button
              type="button"
              onClick={() => (isCurrent && player.status !== 'loading' && player.status !== 'error' ? player.togglePlay() : player.play(song, queue))}
              aria-label={`${isPlaying ? 'Pausar' : 'Reproducir'} ${song.title}`}
              className={`grid size-10 shrink-0 place-items-center rounded-lg transition ${isCurrent ? 'bg-primary text-white' : 'bg-surface-container-lowest text-primary-light hover:bg-primary hover:text-white'}`}
            >
              <span aria-hidden className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-title-sm font-semibold">{song.title}</p>
              <p className="truncate text-body-sm text-on-surface-variant">{song.artist || 'Artista desconocido'}</p>
            </div>
            <span className="relative shrink-0 text-right font-mono text-mono-crypto text-on-surface">
              {plays}
              {/* En móvil solo el número (la unidad queda para lectores de pantalla). */}
              <span className="sr-only sm:not-sr-only"> {plays === 1 ? 'reproducción' : 'reproducciones'}</span>
            </span>
            <span className="hidden w-12 shrink-0 text-right font-mono text-mono-crypto text-on-surface-variant sm:block">{formatDuration(song.duration)}</span>
          </li>
        )
      })}
    </ol>
  )
}

function TopArtists({ stats }: { stats: ListeningStats }) {
  const max = Math.max(1, ...stats.topArtists.map((a) => a.plays))
  return (
    <ol className="flex flex-col gap-4 p-5">
      {stats.topArtists.map((a, i) => (
        <li key={a.artist || '(sin artista)'} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-title-sm font-semibold">
              <span className="mr-2 font-mono text-mono-crypto text-on-surface-variant">{i + 1}</span>
              <span className={a.artist ? 'text-on-surface' : 'italic text-on-surface-variant'}>{artistName(a.artist)}</span>
            </span>
            <span className="shrink-0 font-mono text-mono-crypto text-on-surface">{a.plays}</span>
          </div>
          {/* Barra fina de un solo tono: magnitud relativa al primero. */}
          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-container-lowest">
            <span className="block h-full rounded-full bg-accent-cyan" style={{ width: `${(a.plays / max) * 100}%` }} />
          </span>
          <span className="text-body-sm text-on-surface-variant">
            {plural(a.plays, 'reproducción', 'reproducciones')} · {formatListeningTime(a.listeningSeconds)} ·{' '}
            {plural(a.songs, 'canción', 'canciones')}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * "Tendencias" (mockup musiclock_tendencias_audio_cifrado_gr_ficos_globales),
 * limitada a las estadísticas PERSONALES (Estadísticas FR-02 a FR-05). El ranking
 * global de la plataforma (FR-07) queda en el backlog: mostraría títulos de canciones
 * privadas de otros usuarios.
 */
export function StatsPage() {
  const [params, setParams] = useSearchParams()
  const period = PERIODS.find((p) => p.param === params.get('periodo')) ?? PERIODS[0]
  const player = usePlayer()
  const [result, setResult] = useState<LoadResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Se recarga al cambiar de periodo, con "Reintentar" y cada vez que se registra una reproducción.
  const requestKey = `${period.value}|${reloadKey}|${player.historyVersion}`

  useEffect(() => {
    const controller = new AbortController()
    getStats(period.value, controller.signal)
      .then((stats) => setResult({ key: requestKey, stats }))
      .catch(() => !controller.signal.aborted && setResult({ key: requestKey, error: true }))
    return () => controller.abort()
  }, [period.value, requestKey])

  // Mientras llega el periodo nuevo se sigue mostrando el anterior (sin parpadeo).
  const stats = result && 'stats' in result ? result.stats : null
  const failed = result && 'error' in result && result.key === requestKey
  const loading = result?.key !== requestKey
  const empty = stats?.totalPlays === 0
  const topArtist = stats?.topArtists[0]

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="relative overflow-hidden rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle lg:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.18),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-5">
            <span aria-hidden className="material-symbols-outlined grid size-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-container to-surface-container-lowest text-[40px] text-accent-cyan ring-1 ring-border-blue">
              local_fire_department
            </span>
            <div className="flex flex-col gap-2">
              <span className="font-mono text-mono-label uppercase tracking-wider text-accent-cyan">Tus estadísticas personales</span>
              <h1 className="font-display text-headline-lg font-semibold">Tendencias</h1>
              <p className="max-w-xl text-body-md text-on-surface-variant">Lo que más escuchas en tu bóveda, a partir de tu historial de reproducción.</p>
            </div>
          </div>
          <div role="group" aria-label="Periodo" className="flex rounded-xl bg-surface-container-lowest p-1 ring-1 ring-border-subtle">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={p.value === period.value}
                onClick={() =>
                  setParams((current) => {
                    if (p.value === '7d') current.delete('periodo')
                    else current.set('periodo', p.param)
                    return current
                  })
                }
                className={`rounded-lg px-3 py-2 text-title-sm transition ${p.value === period.value ? 'bg-primary font-semibold text-white' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {failed && (
        <Alert tone="error">
          No se pudieron cargar tus estadísticas.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setReloadKey((k) => k + 1)}>
            Reintentar
          </button>
        </Alert>
      )}

      {!stats && !failed && (
        <p className="py-16 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
          Calculando estadísticas…
        </p>
      )}

      {stats && (
        <div className="flex flex-col gap-6" aria-busy={loading}>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label={`Resumen de ${period.heading}`}>
            <StatTile label="Reproducciones" value={String(stats.totalPlays)} />
            <StatTile label="Tiempo escuchado" value={formatListeningTime(stats.listeningSeconds)} hint="Aproximado" />
            <StatTile label="Canciones distintas" value={String(stats.distinctSongs)} />
            <StatTile label="Artista más escuchado" value={topArtist ? artistName(topArtist.artist) : '—'} hint={topArtist ? plural(topArtist.plays, 'reproducción', 'reproducciones') : undefined} />
          </dl>

          {empty ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-card px-6 py-16 text-center ring-1 ring-border-subtle">
              <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">equalizer</span>
              <p className="text-title-md font-semibold">Sin reproducciones en {period.heading}</p>
              <p className="max-w-sm text-body-md text-on-surface-variant">Reproduce canciones de tu bóveda y aquí verás lo que más escuchas.</p>
              <Link to="/archivos" className="mt-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">
                Ir a Mis Archivos
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
                {stats.daily.length > 0 && (
                  <section className="flex flex-col gap-4 rounded-xl bg-surface-card p-5 ring-1 ring-border-subtle" aria-labelledby="actividad">
                    <h2 id="actividad" className="font-display text-headline-sm font-medium">
                      Reproducciones por día
                    </h2>
                    <DailyPlaysChart daily={stats.daily} />
                  </section>
                )}
                <section className="flex flex-col rounded-xl bg-surface-card ring-1 ring-border-subtle" aria-labelledby="top-canciones">
                  <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
                    <h2 id="top-canciones" className="font-display text-headline-sm font-medium">
                      Tus canciones más escuchadas
                    </h2>
                    <span className="font-mono text-mono-label text-on-surface-variant">{period.label}</span>
                  </div>
                  <TopSongs stats={stats} />
                </section>
              </div>
              <section className="flex min-w-0 flex-col self-start rounded-xl bg-surface-card ring-1 ring-border-subtle" aria-labelledby="top-artistas">
                <div className="border-b border-border-subtle px-5 py-4">
                  <h2 id="top-artistas" className="font-display text-headline-sm font-medium">
                    Tus artistas más escuchados
                  </h2>
                </div>
                <TopArtists stats={stats} />
              </section>
            </div>
          )}

          <p className="text-body-sm text-on-surface-variant">
            Solo cuentan tus canciones: lo que otros comparten contigo no entra en tu historial. El tiempo escuchado suma la duración
            completa de cada canción reproducida. El ranking global de la plataforma no está disponible porque revelaría títulos de
            canciones privadas de otras personas.
          </p>
        </div>
      )}
    </div>
  )
}
