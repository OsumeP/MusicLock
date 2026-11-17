import { useId, useState } from 'react'

import { ApiError } from '../api/client'
import { deleteSong, type Song } from '../api/songs'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'
import { formatBytes } from '../lib/format'

/** Confirmación de borrado definitivo (sin papelera en el MVP). */
export function DeleteSongModal({ song, onClose, onDeleted }: { song: Song; onClose: () => void; onDeleted: (song: Song) => void }) {
  const headingId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await deleteSong(song.id)
      onDeleted(song)
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        onDeleted(song) // ya no existía: el resultado es el mismo
        onClose()
        return
      }
      setError('No se pudo eliminar la canción. Inténtalo de nuevo.')
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={busy}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-security-danger">delete_forever</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            ¿Eliminar “{song.title}”?
          </h2>
        </div>
        <p className="text-body-md text-on-surface-variant">
          Se borrará de forma <strong className="text-on-surface">permanente</strong> el archivo cifrado ({formatBytes(song.size)}) y se
          liberará ese espacio de tu plan. Esta acción no se puede deshacer.
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
            {busy ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
