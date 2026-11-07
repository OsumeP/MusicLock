import { useState, type ReactNode } from 'react'

import { setFavorite, type Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { AddToPlaylistModal } from '../playlists/AddToPlaylistModal'
import { ShareSongModal } from '../sharing/ShareSongModal'
import { usePlayer } from '../player/playerContext'
import { DeleteSongModal } from './DeleteSongModal'
import { downloadOriginalSong } from './downloadSong'
import { EditSongModal } from './EditSongModal'
import type { RowActions } from './SongTable'

export interface Notice {
  tone: 'error' | 'info'
  text: string
}

/**
 * Acciones de las filas de canciones (descargar, añadir a playlist, compartir, editar, eliminar, favorito),
 * compartidas por "Mis Archivos" y "Favoritos".
 *
 * - `onSongChanged`: aplicar un cambio a la lista visible sin recargarla (favorito optimista).
 * - `onReload`: recargar la lista (tras editar, eliminar o confirmar un favorito, si la página lo necesita).
 * - `reloadOnFavorite`: en "Favoritos", desmarcar debe hacer desaparecer la fila.
 * - `onPlaylistsChanged`: se llama al cerrar "Añadir a playlist" (el detalle de una playlist se recarga).
 */
export function useSongActions({
  onSongChanged,
  onReload,
  reloadOnFavorite = false,
  onPlaylistsChanged,
}: {
  onSongChanged: (song: Song) => void
  onReload: () => void
  reloadOnFavorite?: boolean
  onPlaylistsChanged?: () => void
}): {
  actions: Required<RowActions>
  downloadingId: string | null
  favoritePending: ReadonlySet<string>
  notice: Notice | null
  setNotice: (notice: Notice | null) => void
  modals: ReactNode
} {
  const { session, refreshUser } = useAuth()
  const player = usePlayer()
  const [editing, setEditing] = useState<Song | null>(null)
  const [deleting, setDeleting] = useState<Song | null>(null)
  const [addingToPlaylist, setAddingToPlaylist] = useState<Song | null>(null)
  const [sharing, setSharing] = useState<Song | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [favoritePending, setFavoritePending] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState<Notice | null>(null)

  function markPending(id: string, pending: boolean) {
    setFavoritePending((current) => {
      const next = new Set(current)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const actions: Required<RowActions> = {
    async download(song) {
      if (session.status !== 'ready') return
      setDownloadingId(song.id)
      setNotice(null)
      try {
        await downloadOriginalSong(song, session.masterKey)
      } catch {
        setNotice({ tone: 'error', text: `No se pudo descargar “${song.title}”.` })
      } finally {
        setDownloadingId(null)
      }
    },
    addToPlaylist: setAddingToPlaylist,
    share: setSharing,
    edit: setEditing,
    remove: setDeleting,
    async toggleFavorite(song) {
      const wanted = !song.isFavorite
      // Optimista: el corazón cambia al instante y se revierte si la API falla.
      onSongChanged({ ...song, isFavorite: wanted })
      markPending(song.id, true)
      try {
        const saved = await setFavorite(song.id, wanted)
        onSongChanged(saved)
        player.updateSong(saved)
        if (reloadOnFavorite) onReload()
      } catch {
        onSongChanged(song)
        setNotice({
          tone: 'error',
          text: wanted ? `No se pudo añadir “${song.title}” a favoritos.` : `No se pudo quitar “${song.title}” de favoritos.`,
        })
      } finally {
        markPending(song.id, false)
      }
    },
  }

  const modals = (
    <>
      {addingToPlaylist && (
        <AddToPlaylistModal
          song={addingToPlaylist}
          onClose={() => {
            setAddingToPlaylist(null)
            onPlaylistsChanged?.()
          }}
        />
      )}

      {sharing && <ShareSongModal song={sharing} onClose={() => setSharing(null)} />}

      {editing && (
        <EditSongModal
          song={editing}
          onClose={() => setEditing(null)}
          onSaved={(song) => {
            player.updateSong(song)
            setNotice({ tone: 'info', text: `Se guardaron los cambios de “${song.title}”.` })
            onReload()
          }}
        />
      )}

      {deleting && (
        <DeleteSongModal
          song={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(song) => {
            player.forget(song.id)
            setNotice({ tone: 'info', text: `“${song.title}” se eliminó y se liberó su espacio.` })
            onReload()
            void refreshUser()
          }}
        />
      )}
    </>
  )

  return { actions, downloadingId, favoritePending, notice, setNotice, modals }
}
