import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Marco de las pantallas de acceso (mockup "Iniciar sesión"). */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-surface-base">
      {/* Halo de fondo del mockup */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(2,80,152,0.25),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.12),transparent_50%)]"
      />

      <header className="relative z-10 flex items-center gap-3 px-6 py-5">
        <Link to="/" className="flex items-center gap-3">
          <span aria-hidden className="material-symbols-outlined grid size-10 place-items-center rounded-md bg-surface-card text-on-surface">lock</span>
          <span>
            <span className="block font-display text-headline-sm font-semibold leading-none">MusicLock</span>
            <span className="font-mono text-mono-label uppercase tracking-widest text-accent-cyan">Vault secure</span>
          </span>
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
        <div className="text-center">
          <p className="flex items-center justify-center gap-2 font-display text-headline-lg font-bold">
            <span aria-hidden className="material-symbols-outlined text-[28px] text-accent-cyan">graphic_eq</span>
            MusicLock
            <span aria-hidden className="material-symbols-outlined text-[28px] text-accent-cyan">graphic_eq</span>
          </p>
          <p className="mt-1 font-mono text-mono-crypto uppercase tracking-widest text-on-surface-variant">
            Tu espacio seguro de audio
          </p>
        </div>

        <section className="flex w-full max-w-md flex-col gap-5 rounded-xl bg-surface-card p-6 shadow-xl ring-1 ring-border-subtle">
          <div className="text-center">
            <h1 className="font-display text-headline-sm font-semibold">{title}</h1>
            <p className="text-body-sm text-on-surface-variant">{subtitle}</p>
          </div>
          {children}
          <div className="text-center text-body-sm text-on-surface-variant">{footer}</div>
        </section>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-6 py-4 font-mono text-mono-label text-on-surface-variant">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent-cyan" />
          Cifrado AES-GCM en tu navegador · el servidor nunca ve tu música
        </span>
        <span>© 2026 MusicLock</span>
      </footer>
    </div>
  )
}
