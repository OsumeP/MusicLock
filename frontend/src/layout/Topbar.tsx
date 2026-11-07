import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

import { useAuth } from '../auth/session'

/** Secciones con lista filtrable por `?q=`; desde cualquier otra pantalla la búsqueda lleva a "Mis Archivos". */
const SEARCHABLE = ['/archivos', '/favoritos']

/** Barra superior: búsqueda en la bóveda, estado de la sesión cifrada y usuario. */
export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const searchBase = SEARCHABLE.includes(pathname) ? pathname : '/archivos'
  const [params] = useSearchParams()
  const currentQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(currentQuery)
  const [syncedQuery, setSyncedQuery] = useState(currentQuery)

  // Si la búsqueda de la URL cambia desde fuera (p. ej. "Limpiar búsqueda"),
  // se ajusta el campo durante el render (patrón recomendado por React, sin efecto).
  if (currentQuery !== syncedQuery) {
    setSyncedQuery(currentQuery)
    setQuery(currentQuery)
  }

  // Búsqueda mientras se escribe (300 ms de pausa).
  useEffect(() => {
    if (query === currentQuery) return
    const timer = setTimeout(() => {
      navigate(query.trim() ? `${searchBase}?q=${encodeURIComponent(query.trim())}` : searchBase, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [query, currentQuery, navigate, searchBase])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    navigate(query.trim() ? `${searchBase}?q=${encodeURIComponent(query.trim())}` : searchBase)
  }

  if (session.status !== 'ready') return null
  const { user } = session

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-subtle bg-surface-base/90 px-4 backdrop-blur lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-lg p-2 text-on-surface-variant hover:text-on-surface lg:hidden"
        aria-label="Abrir menú"
      >
        <span aria-hidden className="material-symbols-outlined">menu</span>
      </button>

      <form role="search" onSubmit={handleSubmit} className="relative max-w-xl flex-1">
        <span aria-hidden className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
          search
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título o artista…"
          aria-label="Buscar en tu bóveda"
          className="w-full rounded-xl bg-surface-card py-2 pl-10 pr-3 text-body-md text-on-surface outline-none ring-1 ring-border-subtle placeholder:text-on-surface-variant/70 focus:ring-primary-light"
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-2 rounded-full border border-border-blue px-3 py-1 font-mono text-mono-crypto text-accent-cyan md:flex">
          <span className="size-2 rounded-full bg-accent-cyan" />
          Sesión cifrada / PBKDF2
        </span>
        <div className="hidden text-right sm:block">
          <p className="text-title-sm font-semibold text-on-surface">{user.username}</p>
          <p className="font-mono text-mono-label text-on-surface-variant">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg p-2 text-on-surface-variant ring-1 ring-border-subtle hover:text-on-surface"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <span aria-hidden className="material-symbols-outlined text-[20px]">logout</span>
        </button>
      </div>
    </header>
  )
}
