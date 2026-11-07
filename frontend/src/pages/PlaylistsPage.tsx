import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { getPlaylist, listPlaylists, type Playlist } from '../api/playlists'
import { Alert } from '../components/ui'
import { formatBytes, formatDuration, formatRelativeDate } from '../lib/format'
import { usePlayer } from '../player/playerContext'
import { PlaylistFormModal } from '../playlists/PlaylistFormModal'

type LoadResult = { key: number; playlists: Playlist[] } | { key: number; error: true }

function PlaylistCard({ playlist, onPlay, starting }: { playlist: Playlist; onPlay: () => void; starting: boolean }) {
  const empty = playlist.songCount === 0
  return (
    <li className="group relative flex flex-col gap-4 rounded-xl bg-surface-card p-5 ring-1 ring-border-subtle transition hover:ring-border-blue">
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className="material-symbols-outlined grid size-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary-container to-surface-container-lowest text-[28px] text-accent-cyan ring-1 ring-border-blue">
          queue_music
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-2.5 py-1 font-mono text-mono-label text-primary-light">
          <span aria-hidden className="material-symbols-outlined text-[12px]">lock</span>
          Privada
        </span>
      </div>
      <div className="min-w-0">
        {/* El enlace cubre toda la tarjeta (after:absolute); el botón ▶ queda por encima. */}
        <Link to={`/playlists/${playlist.id}`} className="block truncate font-display text-headline-sm font-medium text-on-surface after:absolute after:inset-0 after:rounded-xl">
          {playlist.name}
        </Link>
        <p className="mt-1 line-clamp-2 min-h-10 text-body-sm text-on-surface-variant">{playlist.description || 'Sin descripción'}</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col font-mono text-mono-label text-on-surface-variant">
          <span>
            {playlist.songCount} {playlist.songCount === 1 ? 'pista' : 'pistas'} · {formatBytes(playlist.totalSize)} · {formatDuration(playlist.totalDuration)}
          </span>
          <span>Modificada {formatRelativeDate(playlist.updatedAt)}</span>
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={empty || starting}
          aria-label={`Reproducir ${playlist.name}`}
          title={empty ? 'La playlist está vacía' : `Reproducir ${playlist.name}`}
          className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition enabled:hover:bg-primary-hover disabled:opacity-30"
        >
          <span aria-hidden className={`material-symbols-outlined ${starting ? 'animate-spin' : ''}`} style={{ fontVariationSettings: '"FILL" 1' }}>
            {starting ? 'progress_activity' : 'play_arrow'}
          </span>
        </button>
      </div>
    </li>
  )
}

/** "Playlists" (mockup musiclock_playlists_colecciones_cifradas; Accesos FR-08 a FR-12). */
export function PlaylistsPage() {
  const player = usePlayer()
  const navigate = useNavigate()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<LoadResult | null>(null)
  const [creating, setCreating] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listPlaylists({}, controller.signal)
      .then((playlists) => setResult({ key: reloadKey, playlists }))
      .catch(() => !controller.signal.aborted && setResult({ key: reloadKey, error: true }))
    return () => controller.abort()
  }, [reloadKey])

  const playlists = result && 'playlists' in result ? result.playlists : null
  const failed = result && 'error' in result

  async function playPlaylist(playlist: Playlist) {
    setStartingId(playlist.id)
    setPlayError(null)
    try {
      const { songs } = await getPlaylist(playlist.id)
      if (songs.length > 0) player.playAll(songs)
    } catch {
      setPlayError(`No se pudo abrir “${playlist.name}”.`)
    } finally {
      setStartingId(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-blue px-2.5 py-0.5 font-mono text-mono-label uppercase text-accent-cyan">
            <span aria-hidden className="material-symbols-outlined text-[14px]">queue_music</span>
            Tus colecciones
          </span>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-headline-md font-semibold">
            Playlists
            {playlists && (
              <span className="rounded-md bg-surface-card px-2 py-0.5 font-mono text-mono-crypto font-normal text-on-surface-variant">
                {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
              </span>
            )}
          </h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Agrupa tus pistas en listas privadas. Una playlist solo guarda referencias: el audio sigue cifrado una sola vez en tu bóveda.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-title-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary-hover"
        >
          <span aria-hidden className="material-symbols-outlined">add_box</span>
          Nueva playlist
        </button>
      </div>

      {playError && <Alert tone="error">{playError}</Alert>}
      {failed && (
        <Alert tone="error">
          No se pudieron cargar tus playlists.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setReloadKey((k) => k + 1)}>
            Reintentar
          </button>
        </Alert>
      )}

      {!result && (
        <p className="py-16 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
          Cargando playlists…
        </p>
      )}

      {playlists && playlists.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-xl bg-surface-card px-6 py-16 text-center ring-1 ring-border-subtle">
          <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">queue_music</span>
          <p className="text-title-md font-semibold">Todavía no tienes playlists</p>
          <p className="max-w-sm text-body-md text-on-surface-variant">
            Crea una aquí o usa el botón <span className="material-symbols-outlined align-middle text-[18px]" aria-hidden>playlist_add</span> de una
            canción en “Mis Archivos”.
          </p>
          <button type="button" onClick={() => setCreating(true)} className="mt-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">
            Crear playlist
          </button>
        </section>
      )}

      {playlists && playlists.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Tus playlists">
          {playlists.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} starting={startingId === playlist.id} onPlay={() => void playPlaylist(playlist)} />
          ))}
        </ul>
      )}

      {creating && <PlaylistFormModal onClose={() => setCreating(false)} onSaved={(playlist) => navigate(`/playlists/${playlist.id}`)} />}
    </div>
  )
}
