import { useEffect, useId, useState, type FormEvent } from 'react'

import { addSongToPlaylist, createPlaylist, listPlaylists, removeSongFromPlaylist, type Playlist } from '../api/playlists'
import type { Song } from '../api/songs'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'

/**
 * "Añadir a playlist": lista las playlists del usuario marcando las que ya
 * contienen la canción; cada casilla añade o quita al instante. También permite
 * crear una playlist nueva con la canción dentro.
 */
export function AddToPlaylistModal({ song, onClose }: { song: Song; onClose: () => void }) {
  const headingId = useId()
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listPlaylists({ containing: song.id }, controller.signal)
      .then(setPlaylists)
      .catch(() => !controller.signal.aborted && setLoadFailed(true))
    return () => controller.abort()
  }, [song.id])

  function setOne(id: string, changes: Partial<Playlist>) {
    setPlaylists((current) => current?.map((p) => (p.id === id ? { ...p, ...changes } : p)) ?? null)
  }

  function markPending(id: string, value: boolean) {
    setPending((current) => {
      const next = new Set(current)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function toggle(playlist: Playlist) {
    const adding = !playlist.containsSong
    setError(null)
    setOne(playlist.id, { containsSong: adding, songCount: playlist.songCount + (adding ? 1 : -1) })
    markPending(playlist.id, true)
    try {
      if (adding) setOne(playlist.id, { ...(await addSongToPlaylist(playlist.id, song.id)), containsSong: true })
      else await removeSongFromPlaylist(playlist.id, song.id)
    } catch {
      setOne(playlist.id, { containsSong: playlist.containsSong, songCount: playlist.songCount })
      setError(adding ? `No se pudo añadir a “${playlist.name}”.` : `No se pudo quitar de “${playlist.name}”.`)
    } finally {
      markPending(playlist.id, false)
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    try {
      const created = await createPlaylist({ name })
      const withSong = await addSongToPlaylist(created.id, song.id)
      setPlaylists((current) => [{ ...withSong, containsSong: true }, ...(current ?? [])])
      setNewName('')
    } catch {
      setError('No se pudo crear la playlist.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={creating}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-primary-light">playlist_add</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            Añadir a playlist
          </h2>
        </div>
        <p className="truncate text-body-md text-on-surface-variant">
          “<span className="text-on-surface">{song.title}</span>”
        </p>

        {error && <Alert tone="error">{error}</Alert>}
        {loadFailed && <Alert tone="error">No se pudieron cargar tus playlists.</Alert>}
        {!playlists && !loadFailed && (
          <p className="py-4 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
            Cargando playlists…
          </p>
        )}

        {playlists && playlists.length > 0 && (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" aria-label="Tus playlists">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-container-high">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary-light)]"
                    checked={!!playlist.containsSong}
                    disabled={pending.has(playlist.id)}
                    onChange={() => void toggle(playlist)}
                  />
                  <span className="min-w-0 flex-1 truncate text-title-sm text-on-surface">{playlist.name}</span>
                  <span className="shrink-0 font-mono text-mono-label text-on-surface-variant">
                    {playlist.songCount} {playlist.songCount === 1 ? 'pista' : 'pistas'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {playlists && playlists.length === 0 && (
          <p className="text-body-md text-on-surface-variant">Todavía no tienes playlists. Crea la primera:</p>
        )}

        <form onSubmit={handleCreate} className="flex gap-2 border-t border-border-subtle pt-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={150}
            placeholder="Nombre de una playlist nueva"
            aria-label="Nombre de la playlist nueva"
            disabled={creating}
            className="min-w-0 flex-1 rounded-lg bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface outline-none ring-1 ring-border-subtle placeholder:text-on-surface-variant/70 focus:ring-primary-light"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-title-sm font-semibold enabled:hover:bg-primary-hover disabled:opacity-40"
          >
            <span aria-hidden className={`material-symbols-outlined text-[18px] ${creating ? 'animate-spin' : ''}`}>{creating ? 'progress_activity' : 'add'}</span>
            Crear y añadir
          </button>
        </form>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={creating} className="rounded-lg px-4 py-2 text-title-sm ring-1 ring-border-subtle hover:text-on-surface disabled:opacity-40">
            Listo
          </button>
        </div>
      </div>
    </Modal>
  )
}
