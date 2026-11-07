import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { ApiError } from '../api/client'
import { HISTORY_PAGE_SIZE, listHistory, type HistoryPage } from '../api/history'
import type { Song } from '../api/songs'
import { Alert } from '../components/ui'
import { formatBytes } from '../lib/format'
import { usePlayer } from '../player/playerContext'
import { ClearHistoryModal } from '../vault/ClearHistoryModal'
import { NoticeAlert, Pager } from '../vault/ListControls'
import { SongTable } from '../vault/SongTable'
import { useSongActions } from '../vault/useSongActions'

type LoadResult = { key: string; page: HistoryPage } | { key: string; error: string }

/** Canciones sin repetir, en el orden en que aparecen (la cola de reproducción del historial). */
function uniqueSongs(songs: Song[]): Song[] {
  const seen = new Set<string>()
  return songs.filter((song) => !seen.has(song.id) && seen.add(song.id))
}

/**
 * "Recientes" (mockup musiclock_recientes_historial_de_b_veda_streaming):
 * historial de reproducción, la más reciente primero (Interfaz FR-05, Estadísticas FR-06).
 */
export function RecentPage() {
  const [params, setParams] = useSearchParams()
  const pageNumber = Math.max(1, Number(params.get('page')) || 1)
  const player = usePlayer()
  const [result, setResult] = useState<LoadResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [clearOpen, setClearOpen] = useState(false)
  // Cada reproducción registrada (historyVersion) recarga la lista.
  const requestKey = `${pageNumber}|${reloadKey}|${player.historyVersion}`

  useEffect(() => {
    const controller = new AbortController()
    listHistory({ page: pageNumber }, controller.signal)
      .then((page) => setResult({ key: requestKey, page }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404 && pageNumber > 1) {
          setParams((p) => { p.delete('page'); return p }, { replace: true })
          return
        }
        setResult({ key: requestKey, error: 'No se pudo cargar tu historial. Inténtalo de nuevo.' })
      })
    return () => controller.abort()
  }, [pageNumber, requestKey, setParams])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const updateSong = useCallback((song: Song) => {
    setResult((current) =>
      current && 'page' in current
        ? {
            ...current,
            page: { ...current.page, entries: current.page.entries.map((e) => (e.song.id === song.id ? { ...e, song } : e)) },
          }
        : current,
    )
  }, [])
  const songActions = useSongActions({ onSongChanged: updateSong, onReload: reload })

  const page = result && 'page' in result ? result.page : null
  const error = result && 'error' in result && result.key === requestKey ? result.error : null
  const loading = result?.key !== requestKey
  const entries = page?.entries ?? []
  const songs = entries.map((e) => e.song)
  const queue = uniqueSongs(songs)
  const first = page && page.count > 0 ? (pageNumber - 1) * HISTORY_PAGE_SIZE + 1 : 0

  function goToPage(target: number) {
    setParams((p) => {
      if (target <= 1) p.delete('page')
      else p.set('page', String(target))
      return p
    })
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-blue px-2.5 py-0.5 font-mono text-mono-label uppercase text-accent-cyan">
            <span aria-hidden className="material-symbols-outlined text-[14px]">history</span>
            Historial de la bóveda
          </span>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-headline-md font-semibold">
            Recientes
            {page && (
              <span className="rounded-md bg-surface-card px-2 py-0.5 font-mono text-mono-crypto font-normal text-on-surface-variant">
                {page.count} {page.count === 1 ? 'reproducción' : 'reproducciones'}
              </span>
            )}
          </h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Las pistas que reprodujiste, la más reciente primero. El servidor solo sabe <strong className="font-semibold text-on-surface">qué</strong> y{' '}
            <strong className="font-semibold text-on-surface">cuándo</strong>; el audio se descifra únicamente en tu navegador.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={entries.length === 0}
            onClick={() => setClearOpen(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-title-sm ring-1 ring-border-subtle enabled:hover:text-on-surface disabled:opacity-40"
          >
            <span aria-hidden className="material-symbols-outlined">delete_sweep</span>
            Borrar historial
          </button>
          <button
            type="button"
            disabled={entries.length === 0}
            onClick={() => player.play(queue[0], queue)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-title-sm font-semibold shadow-lg shadow-primary/20 enabled:hover:bg-primary-hover disabled:opacity-40"
          >
            <span aria-hidden className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>play_arrow</span>
            Reanudar la última
          </button>
        </div>
      </div>

      <NoticeAlert notice={songActions.notice} onClose={() => songActions.setNotice(null)} />

      {error && !page && (
        <Alert tone="error">
          {error}{' '}
          <button type="button" className="font-semibold underline" onClick={reload}>
            Reintentar
          </button>
        </Alert>
      )}

      <section className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-border-subtle" aria-busy={loading}>
        {!page && !error ? (
          <p className="px-6 py-16 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
            Cargando historial…
          </p>
        ) : page && entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">history</span>
            <p className="text-title-md font-semibold">Todavía no has reproducido nada</p>
            <p className="max-w-sm text-body-md text-on-surface-variant">Las canciones que escuches aparecerán aquí.</p>
            <Link to="/archivos" className="mt-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">
              Ir a Mis Archivos
            </Link>
          </div>
        ) : page ? (
          <SongTable
            songs={songs}
            queue={queue}
            firstIndex={first}
            caption="Historial de reproducción"
            dateLabel="Reproducido"
            dateOf={(_song, i) => entries[i].playedAt}
            rowKey={(_song, i) => String(entries[i].id)}
            downloadingId={songActions.downloadingId}
            favoritePending={songActions.favoritePending}
            actions={songActions.actions}
          />
        ) : null}
      </section>

      {page && page.count > 0 && (
        <Pager
          first={first}
          last={first + entries.length - 1}
          count={page.count}
          pageNumber={pageNumber}
          totalSize={formatBytes(queue.reduce((sum, s) => sum + s.size, 0))}
          hasPrevious={page.hasPrevious}
          hasNext={page.hasNext}
          onPage={goToPage}
        />
      )}

      {clearOpen && page && (
        <ClearHistoryModal
          count={page.count}
          onClose={() => setClearOpen(false)}
          onCleared={() => {
            songActions.setNotice({ tone: 'info', text: 'Se borró tu historial de reproducción.' })
            if (pageNumber > 1) setParams({})
            reload()
          }}
        />
      )}

      {songActions.modals}
    </div>
  )
}
