import { useId, useState } from 'react'

import { ApiError } from '../api/client'
import { deletePlaylist, type Playlist } from '../api/playlists'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'

/** Confirmación para borrar una playlist. Sus canciones siguen en la bóveda. */
export function DeletePlaylistModal({ playlist, onClose, onDeleted }: { playlist: Playlist; onClose: () => void; onDeleted: () => void }) {
  const headingId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await deletePlaylist(playlist.id)
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setError('No se pudo borrar la playlist. Inténtalo de nuevo.')
        setBusy(false)
        return
      }
    }
    onDeleted()
    onClose()
  }

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={busy}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-security-danger">delete</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            ¿Borrar “{playlist.name}”?
          </h2>
        </div>
        <p className="text-body-md text-on-surface-variant">
          {playlist.songCount === 0 ? (
            'La playlist está vacía.'
          ) : (
            <>
              Se borrará la playlist. {playlist.songCount === 1 ? 'Su canción sigue' : `Sus ${playlist.songCount} canciones siguen`} en tu
              bóveda: <strong className="text-on-surface">no se elimina ningún archivo</strong>.
            </>
          )}
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} data-autofocus className="rounded-lg px-4 py-2 text-title-sm ring-1 ring-border-subtle hover:text-on-surface disabled:opacity-40">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-security-danger px-4 py-2 text-title-sm font-semibold text-white hover:bg-security-danger/90 disabled:opacity-60"
          >
            <span aria-hidden className={`material-symbols-outlined text-[18px] ${busy ? 'animate-spin' : ''}`}>{busy ? 'progress_activity' : 'delete'}</span>
            {busy ? 'Borrando…' : 'Borrar playlist'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
