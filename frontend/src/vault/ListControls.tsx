import { Alert } from '../components/ui'
import type { Notice } from './useSongActions'

/** Aviso descartable sobre la lista (resultado de una acción). */
export function NoticeAlert({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null
  return (
    <Alert tone={notice.tone}>
      <span className="flex items-center justify-between gap-3">
        {notice.text}
        <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="opacity-70 hover:opacity-100">
          <span aria-hidden className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </span>
    </Alert>
  )
}

/** Pie de lista: "Mostrando a–b de n · tamaño" + Anterior / Siguiente. */
export function Pager({
  first,
  last,
  count,
  pageNumber,
  totalSize,
  hasPrevious,
  hasNext,
  onPage,
}: {
  first: number
  last: number
  count: number
  pageNumber: number
  totalSize: string
  hasPrevious: boolean
  hasNext: boolean
  onPage: (page: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-mono-crypto text-on-surface-variant">
      <span>
        Mostrando {first}–{last} de {count} · {totalSize} en esta página
      </span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!hasPrevious} onClick={() => onPage(pageNumber - 1)} className="rounded-lg px-3 py-1.5 ring-1 ring-border-subtle enabled:hover:text-on-surface disabled:opacity-40">
          Anterior
        </button>
        <span className="text-on-surface">{pageNumber}</span>
        <button type="button" disabled={!hasNext} onClick={() => onPage(pageNumber + 1)} className="rounded-lg px-3 py-1.5 ring-1 ring-border-subtle enabled:hover:text-on-surface disabled:opacity-40">
          Siguiente
        </button>
      </div>
    </div>
  )
}
