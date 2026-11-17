import { useId, useState } from 'react'

import { clearHistory } from '../api/history'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'

/** Confirmación para borrar todo el historial de reproducción (las canciones no se tocan). */
export function ClearHistoryModal({ count, onClose, onCleared }: { count: number; onClose: () => void; onCleared: () => void }) {
  const headingId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await clearHistory()
      onCleared()
      onClose()
    } catch {
      setError('No se pudo borrar el historial. Inténtalo de nuevo.')
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={busy}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-security-warning">history_toggle_off</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            ¿Borrar tu historial?
          </h2>
        </div>
        <p className="text-body-md text-on-surface-variant">
          Se eliminarán {count === 1 ? 'la reproducción registrada' : `las ${count} reproducciones registradas`}. Tus canciones y tus
          favoritos <strong className="text-on-surface">no se tocan</strong>. Esta acción no se puede deshacer.
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
            <span aria-hidden className={`material-symbols-outlined text-[18px] ${busy ? 'animate-spin' : ''}`}>{busy ? 'progress_activity' : 'delete_sweep'}</span>
            {busy ? 'Borrando…' : 'Borrar historial'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
