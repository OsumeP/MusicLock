import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { getPlaylist, moveSongInPlaylist, removeSongFromPlaylist, type PlaylistDetail } from '../api/playlists'
import type { Song } from '../api/songs'
import { Alert } from '../components/ui'
import { formatBytes, formatDuration, formatRelativeDate } from '../lib/format'
import { usePlayer } from '../player/playerContext'
import { DeletePlaylistModal } from '../playlists/DeletePlaylistModal'
import { PlaylistFormModal } from '../playlists/PlaylistFormModal'
import { NoticeAlert } from '../vault/ListControls'
import { SongTable } from '../vault/SongTable'
import { useSongActions } from '../vault/useSongActions'

type LoadResult = { key: string; playlist: PlaylistDetail } | { key: string; error: 'not_found' | 'failed' }

function ExtraButton({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-on-surface-variant transition enabled:hover:bg-surface-container-high enabled:hover:text-on-surface disabled:opacity-25"
    >
      <span aria-hidden className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  )
}

/** Detalle de una playlist: sus canciones en orden, reproducir, reordenar, quitar, editar y borrar (Accesos FR-09 a FR-12). */
export function PlaylistDetailPage() {
  const { playlistId = '' } = useParams()
  const navigate = useNavigate()
  const player = usePlayer()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<LoadResult | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const requestKey = `${playlistId}|${reloadKey}`

  useEffect(() => {
    const controller = new AbortController()
    getPlaylist(playlistId, controller.signal)
      .then((playlist) => setResult({ key: requestKey, playlist }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setResult({ key: requestKey, error: error instanceof ApiError && error.status === 404 ? 'not_found' : 'failed' })
      })
    return () => controller.abort()
  }, [playlistId, requestKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const setPlaylist = useCallback((update: (playlist: PlaylistDetail) => PlaylistDetail) => {
    setResult((current) => (current && 'playlist' in current ? { ...current, playlist: update(current.playlist) } : current))
  }, [])
  const updateSong = useCallback(
    (song: Song) => setPlaylist((p) => ({ ...p, songs: p.songs.map((s) => (s.id === song.id ? song : s)) })),
    [setPlaylist],
  )
  const songActions = useSongActions({ onSongChanged: updateSong, onReload: reload, onPlaylistsChanged: reload })

  const playlist = result && 'playlist' in result && result.playlist.id === playlistId ? result.playlist : null
  const error = result && 'error' in result && result.key === requestKey ? result.error : null

  async function move(song: Song, position: number) {
    if (!playlist) return
    // Optimista: el orden cambia al instante; la respuesta del servidor manda.
    setPlaylist((p) => {
      const songs = p.songs.filter((s) => s.id !== song.id)
      songs.splice(position, 0, song)
      return { ...p, songs }
    })
    setBusy(true)
    try {
      const saved = await moveSongInPlaylist(playlist.id, song.id, position)
      setPlaylist(() => saved)
    } catch {
      songActions.setNotice({ tone: 'error', text: `No se pudo mover “${song.title}”.` })
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function removeFromPlaylist(song: Song) {
    if (!playlist) return
    setPlaylist((p) => ({ ...p, songs: p.songs.filter((s) => s.id !== song.id), songCount: p.songCount - 1 }))
    setBusy(true)
    try {
      await removeSongFromPlaylist(playlist.id, song.id)
      songActions.setNotice({ tone: 'info', text: `“${song.title}” se quitó de la playlist (sigue en tu bóveda).` })
      reload() // totales actualizados
    } catch {
      songActions.setNotice({ tone: 'error', text: `No se pudo quitar “${song.title}”.` })
      reload()
    } finally {
      setBusy(false)
    }
  }

  if (error === 'not_found') {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
        <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">playlist_remove</span>
        <h1 className="font-display text-headline-sm font-medium">Playlist no encontrada</h1>
        <p className="text-body-md text-on-surface-variant">No existe o no es tuya.</p>
        <Link to="/playlists" className="mt-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">
          Volver a Playlists
        </Link>
      </div>
    )
  }

  const songs = playlist?.songs ?? []

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <Link to="/playlists" className="flex w-fit items-center gap-1 text-body-sm text-primary-light hover:text-on-surface">
        <span aria-hidden className="material-symbols-outlined text-[18px]">arrow_back</span>
        Playlists
      </Link>

      {error === 'failed' && !playlist && (
        <Alert tone="error">
          No se pudo cargar la playlist.{' '}
          <button type="button" className="font-semibold underline" onClick={reload}>
            Reintentar
          </button>
        </Alert>
      )}

      {!playlist && !error && (
        <p className="py-16 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
          Cargando playlist…
        </p>
      )}

      {playlist && (
        <>
          <section className="relative overflow-hidden rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle lg:p-8">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.18),transparent_60%)]" />
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div className="flex min-w-0 items-center gap-5">
                <span aria-hidden className="material-symbols-outlined grid size-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-container to-surface-container-lowest text-[40px] text-accent-cyan ring-1 ring-border-blue">
                  queue_music
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-mono text-mono-label uppercase tracking-wider text-accent-cyan">Playlist privada</span>
                  <h1 className="break-words font-display text-headline-lg font-semibold">{playlist.name}</h1>
                  {playlist.description && <p className="text-body-md text-on-surface-variant">{playlist.description}</p>}
                  <p className="font-mono text-mono-crypto text-on-surface-variant">
                    {playlist.songCount} {playlist.songCount === 1 ? 'pista' : 'pistas'} · {formatDuration(playlist.totalDuration)} ·{' '}
                    {formatBytes(playlist.totalSize)} cifrados · modificada {formatRelativeDate(playlist.updatedAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 rounded-xl px-4 py-3 text-title-sm ring-1 ring-border-subtle hover:text-on-surface"
                >
                  <span aria-hidden className="material-symbols-outlined">edit</span>
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  className="flex items-center gap-2 rounded-xl px-4 py-3 text-title-sm ring-1 ring-border-subtle hover:text-security-danger"
                >
                  <span aria-hidden className="material-symbols-outlined">delete</span>
                  Borrar
                </button>
                <button
                  type="button"
                  disabled={songs.length === 0}
                  onClick={() => player.play(songs[0], songs)}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-title-sm font-semibold shadow-lg shadow-primary/20 enabled:hover:bg-primary-hover disabled:opacity-40"
                >
                  <span aria-hidden className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>play_arrow</span>
                  Reproducir
                </button>
              </div>
            </div>
          </section>

          <NoticeAlert notice={songActions.notice} onClose={() => songActions.setNotice(null)} />

          <section className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-border-subtle" aria-busy={busy}>
            {songs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">playlist_add</span>
                <p className="text-title-md font-semibold">Esta playlist está vacía</p>
                <p className="max-w-sm text-body-md text-on-surface-variant">
                  En “Mis Archivos”, usa el botón “Añadir a una playlist” de cada canción.
                </p>
                <Link to="/archivos" className="mt-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">
                  Ir a Mis Archivos
                </Link>
              </div>
            ) : (
              <SongTable
                songs={songs}
                firstIndex={1}
                caption={`Canciones de ${playlist.name}`}
                // Aquí "eliminar" de la bóveda no aparece: se usa "Quitar de la playlist".
                actions={{ ...songActions.actions, remove: undefined }}
                downloadingId={songActions.downloadingId}
                favoritePending={songActions.favoritePending}
                rowExtras={(song, i) => (
                  <>
                    <ExtraButton icon="arrow_upward" label={`Subir ${song.title}`} disabled={busy || i === 0} onClick={() => void move(song, i - 1)} />
                    <ExtraButton
                      icon="arrow_downward"
                      label={`Bajar ${song.title}`}
                      disabled={busy || i === songs.length - 1}
                      onClick={() => void move(song, i + 1)}
                    />
                    <ExtraButton icon="playlist_remove" label={`Quitar ${song.title} de la playlist`} disabled={busy} onClick={() => void removeFromPlaylist(song)} />
                  </>
                )}
              />
            )}
          </section>
        </>
      )}

      {songActions.modals}

      {editing && playlist && (
        <PlaylistFormModal
          playlist={playlist}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setPlaylist((p) => ({ ...p, ...saved }))
            songActions.setNotice({ tone: 'info', text: 'Se guardaron los cambios de la playlist.' })
          }}
        />
      )}

      {deleting && playlist && <DeletePlaylistModal playlist={playlist} onClose={() => setDeleting(false)} onDeleted={() => navigate('/playlists')} />}
    </div>
  )
}
