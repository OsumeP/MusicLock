import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Ventana modal accesible (role="dialog", Esc para cerrar, foco inicial dentro).
 * No usa diálogos nativos del navegador (alert/confirm). Con `locked` no se
 * puede cerrar (p. ej. durante una subida).
 */
export function Modal({
  labelledBy,
  onClose,
  locked = false,
  children,
}: {
  labelledBy: string
  onClose: () => void
  locked?: boolean
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Prioridad: el elemento marcado con data-autofocus (p. ej. "Cancelar" en un borrado); si no, el primer control.
    const panel = panelRef.current
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input, button:not([aria-label="Cerrar ventana"])')
    target?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !locked) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [locked, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        className="absolute inset-0 bg-surface-container-lowest/80 backdrop-blur-sm"
        onClick={() => !locked && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative w-full max-w-lg rounded-xl bg-surface-card p-6 shadow-2xl ring-1 ring-border-subtle"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={locked}
          aria-label="Cerrar ventana"
          className="absolute right-4 top-4 rounded-lg p-1 text-on-surface-variant hover:text-on-surface disabled:opacity-40"
        >
          <span aria-hidden className="material-symbols-outlined">close</span>
        </button>
        {children}
      </div>
    </div>
  )
}
