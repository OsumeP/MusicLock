/**
 * Barra del reproductor (mockup). Día 6: solo la estructura; el día 7 se conecta
 * al descifrado en memoria y a la lista de canciones.
 */
export function PlayerBar() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 flex h-20 items-center gap-4 border-t border-border-subtle bg-surface-raised/95 px-4 backdrop-blur lg:left-64 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden className="material-symbols-outlined grid size-11 place-items-center rounded-lg bg-surface-card text-on-surface-variant">
          graphic_eq
        </span>
        <div className="min-w-0">
          <p className="truncate text-title-sm text-on-surface-variant">Ninguna canción seleccionada</p>
          <p className="font-mono text-mono-label text-on-surface-variant/70">El reproductor descifra en memoria (día 7)</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-on-surface-variant/50" aria-hidden>
        <span className="material-symbols-outlined">skip_previous</span>
        <span className="material-symbols-outlined grid size-10 place-items-center rounded-full bg-surface-card">play_arrow</span>
        <span className="material-symbols-outlined">skip_next</span>
      </div>
      <div className="hidden flex-1 justify-end md:flex">
        <span className="flex items-center gap-1.5 rounded-lg border border-border-blue px-2.5 py-1 font-mono text-mono-label text-accent-cyan">
          <span aria-hidden className="material-symbols-outlined text-[14px]">lock</span>
          RAM decrypt: AES-GCM
        </span>
      </div>
    </footer>
  )
}
