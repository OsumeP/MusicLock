import { useState } from 'react'
import { Outlet } from 'react-router'

import { PlayerProvider } from '../player/PlayerProvider'
import { PlayerBar } from './PlayerBar'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/**
 * Marco de la bóveda (mockups del dashboard): barra lateral, barra superior,
 * contenido y reproductor. El PlayerProvider vive aquí: al salir de la bóveda
 * (logout) se desmonta y libera el audio descifrado.
 */
export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <PlayerProvider>
      <div className="min-h-screen bg-surface-base">
        {/* Barra lateral fija en escritorio */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border-subtle bg-surface-raised shadow-[0_2px_12px_rgba(0,0,0,0.5)] lg:block">
          <Sidebar />
        </aside>

        {/* Barra lateral como panel en móvil */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-surface-container-lowest/70" onClick={() => setMenuOpen(false)} />
            <aside className="relative h-full w-72 max-w-[85%] bg-surface-raised shadow-2xl">
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </aside>
          </div>
        )}

        <div className="lg:pl-64">
          <Topbar onOpenMenu={() => setMenuOpen(true)} />
          <main className="px-4 pb-28 pt-6 lg:px-8">
            <Outlet />
          </main>
        </div>

        <PlayerBar />
      </div>
    </PlayerProvider>
  )
}
