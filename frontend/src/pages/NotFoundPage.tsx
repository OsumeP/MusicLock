import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-base px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span aria-hidden className="material-symbols-outlined text-[56px] text-border-blue">travel_explore</span>
        <h1 className="font-display text-headline-lg font-semibold">Página no encontrada</h1>
        <p className="text-body-lg text-on-surface-variant">La dirección que buscas no existe o cambió.</p>
        <Link to="/" className="rounded-lg bg-primary px-5 py-2.5 text-title-sm font-semibold hover:bg-primary-hover">Volver al inicio</Link>
      </div>
    </main>
  )
}
