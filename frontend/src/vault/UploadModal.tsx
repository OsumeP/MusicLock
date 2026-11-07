import { useEffect, useId, useRef, useState } from 'react'

import type { Song } from '../api/songs'
import { UploadPanel } from './UploadPanel'

/**
 * Modal de subida. No usa diálogos nativos del navegador: es un panel accesible
 * (role="dialog", Esc para cerrar, foco inicial dentro). No se puede cerrar
 * mientras una subida está en curso.
 */
export function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: (song: Song) => void }) {
  const headingId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        className="absolute inset-0 bg-surface-container-lowest/80 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-full max-w-lg rounded-xl bg-surface-card p-6 shadow-2xl ring-1 ring-border-subtle"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Cerrar ventana de subida"
          className="absolute right-4 top-4 rounded-lg p-1 text-on-surface-variant hover:text-on-surface disabled:opacity-40"
        >
          <span aria-hidden className="material-symbols-outlined">close</span>
        </button>
        <UploadPanel
          bare
          headingId={headingId}
          onBusyChange={setBusy}
          onUploaded={(song) => {
            onUploaded(song)
            onClose()
          }}
        />
      </div>
    </div>
  )
}
