import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { listSongs, type SongPage } from '../api/songs'
import { useAuth } from '../auth/session'
import { Alert } from '../components/ui'
import { MIN_PBKDF2_ITERATIONS } from '../crypto'
import { formatBytes, formatDuration, formatRelativeDate } from '../lib/format'
import { usePlayer } from '../player/playerContext'
import { UploadModal } from '../vault/UploadModal'

const RECENT_COUNT = 5

type LoadResult = { key: number; page: SongPage } | { key: number; error: true }

/**
 * Dashboard "Inicio" (mockup musiclock_inicio_vertical_archivos_tendencias_y_cuota),
 * simplificado al alcance del MVP: recientes, cuota y estado del cifrado.
 */
export function HomePage() {
  const { session, refreshUser } = useAuth()
  const player = usePlayer()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<LoadResult | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listSongs({ pageSize: RECENT_COUNT }, controller.signal)
      .then((page) => setResult({ key: reloadKey, page }))
      .catch(() => !controller.signal.aborted && setResult({ key: reloadKey, error: true }))
    return () => controller.abort()
  }, [reloadKey])

  // Al entrar, refresca la cuota (puede haber cambiado desde otra pestaña o dispositivo).
  useEffect(() => {
    void refreshUser().catch(() => {})
  }, [refreshUser])

  if (session.status !== 'ready') return null
  const { user } = session
  const page = result && 'page' in result ? result.page : null
  const failed = result && 'error' in result
  const percent = Math.min(100, (user.usedStorage / user.plan.maxStorageBytes) * 100)

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Bienvenida */}
      <section className="relative overflow-hidden rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle lg:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(2,80,152,0.35),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <span className="w-fit rounded-full border border-border-blue px-2.5 py-0.5 font-mono text-mono-label uppercase text-accent-cyan">
              Bóveda principal cifrada · AES-256 GCM · Zero-Knowledge
            </span>
            <h1 className="font-display text-headline-lg font-semibold">Hola, {user.username}</h1>
            <p className="text-body-lg text-on-surface-variant">
              Cifra, almacena y reproduce tu música directamente en tu navegador. El servidor guarda tus archivos sin poder escucharlos.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setUploadOpen(true)} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-title-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary-hover">
              <span aria-hidden className="material-symbols-outlined">enhanced_encryption</span>
              Subir audio
            </button>
            <Link to="/archivos" className="flex items-center gap-2 rounded-xl px-5 py-3 text-title-sm ring-1 ring-border-blue hover:bg-surface-container-high">
              <span aria-hidden className="material-symbols-outlined">folder_special</span>
              Mis archivos
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recientes */}
        <section className="flex flex-col rounded-xl bg-surface-card ring-1 ring-border-subtle lg:col-span-2" aria-labelledby="recientes">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <h2 id="recientes" className="font-display text-headline-sm font-medium">Subidos recientemente</h2>
            {page && page.count > 0 && (
              <Link to="/archivos" className="text-body-sm text-primary-light hover:text-on-surface">
                Ver los {page.count} →
              </Link>
            )}
          </div>
          {failed && (
            <div className="p-5">
              <Alert tone="error">
                No se pudieron cargar tus canciones.{' '}
                <button type="button" className="font-semibold underline" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</button>
              </Alert>
            </div>
          )}
          {!result && <p className="px-5 py-10 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">Cargando…</p>}
          {page && page.songs.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <span aria-hidden className="material-symbols-outlined text-[40px] text-border-blue">library_music</span>
              <p className="text-title-sm font-semibold">Aún no tienes canciones</p>
              <p className="text-body-md text-on-surface-variant">Sube tu primer MP3 con el botón “Subir audio”.</p>
            </div>
          )}
          {page && page.songs.length > 0 && (
            <ul className="divide-y divide-border-subtle/60">
              {page.songs.map((song) => {
                const isCurrent = player.current?.id === song.id
                const isPlaying = isCurrent && player.status === 'playing'
                return (
                  <li key={song.id} className={`flex items-center gap-4 px-5 py-3 ${isCurrent ? 'bg-primary-container/30' : ''}`}>
                    <button
                      type="button"
                      onClick={() => (isCurrent && player.status !== 'loading' && player.status !== 'error' ? player.togglePlay() : player.play(song, page.songs))}
                      aria-label={`${isPlaying ? 'Pausar' : 'Reproducir'} ${song.title}`}
                      className={`grid size-10 shrink-0 place-items-center rounded-lg transition ${isCurrent ? 'bg-primary text-white' : 'bg-surface-container-lowest text-primary-light hover:bg-primary hover:text-white'}`}
                    >
                      <span aria-hidden className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-title-sm font-semibold">{song.title}</p>
                      <p className="truncate text-body-sm text-on-surface-variant">{song.artist || 'Artista desconocido'}</p>
                    </div>
                    <span className="hidden font-mono text-mono-crypto text-on-surface-variant sm:block">{formatDuration(song.duration)}</span>
                    <span className="hidden font-mono text-mono-crypto text-on-surface-variant md:block">{formatRelativeDate(song.createdAt)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          {/* Cuota */}
          <section className="rounded-xl bg-surface-card p-5 ring-1 ring-border-subtle" aria-labelledby="cuota">
            <h2 id="cuota" className="font-display text-headline-sm font-medium">Cuota de almacenamiento</h2>
            <p className="text-body-sm text-on-surface-variant">Plan {user.plan.name}</p>
            <p className="mt-4 font-display text-headline-lg font-semibold">
              {formatBytes(user.usedStorage)}
              <span className="text-headline-sm font-normal text-on-surface-variant"> / {formatBytes(user.plan.maxStorageBytes)}</span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high" role="meter" aria-label="Almacenamiento usado" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent-cyan" style={{ width: `${Math.max(percent, user.usedStorage > 0 ? 1 : 0)}%` }} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-body-sm">
              <div>
                <dt className="text-on-surface-variant">Disponible</dt>
                <dd className="font-mono text-mono-crypto text-on-surface">{formatBytes(user.storageAvailable)}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Máx. por archivo</dt>
                <dd className="font-mono text-mono-crypto text-on-surface">{formatBytes(user.plan.maxFileSizeBytes)}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Canciones</dt>
                <dd className="font-mono text-mono-crypto text-on-surface">{page ? page.count : '—'}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-lg bg-surface-container-lowest px-3 py-2 text-body-sm text-on-surface-variant">
              Premium (5 GB, 100 MB por archivo) estará disponible próximamente.
            </p>
          </section>

          {/* Estado del cifrado */}
          <section className="rounded-xl bg-surface-card p-5 ring-1 ring-border-subtle" aria-labelledby="proteccion">
            <h2 id="proteccion" className="font-display text-headline-sm font-medium">Cómo se protege tu bóveda</h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-body-sm">
              {[
                ['lock', 'Cada canción con su propia clave AES-GCM de 256 bits'],
                ['key', `Clave maestra derivada de tu contraseña (PBKDF2, ${MIN_PBKDF2_ITERATIONS.toLocaleString('es-CO')} iteraciones)`],
                ['memory', 'Clave maestra guardada en este navegador como no extraíble'],
                ['cloud_off', 'El servidor solo recibe archivos cifrados y nunca tu contraseña'],
              ].map(([icon, text]) => (
                <li key={icon} className="flex items-start gap-2">
                  <span aria-hidden className="material-symbols-outlined text-[18px] text-accent-cyan">{icon}</span>
                  <span className="text-on-surface">{text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onUploaded={() => setReloadKey((k) => k + 1)} />}
    </div>
  )
}
