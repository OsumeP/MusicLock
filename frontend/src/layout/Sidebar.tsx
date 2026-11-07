import { NavLink } from 'react-router'

import { StorageMeter } from './StorageMeter'

interface NavItem {
  label: string
  icon: string
  /** Sin `to`: sección del backlog, se muestra como "Pronto". */
  to?: string
}

/** Secciones de los mockups. En el MVP están "Inicio" y "Mis Archivos" (PlanMVP §1). */
const NAV: NavItem[] = [
  { label: 'Inicio', icon: 'home', to: '/inicio' },
  { label: 'Mis Archivos', icon: 'folder_special', to: '/archivos' },
  { label: 'Favoritos', icon: 'favorite' },
  { label: 'Playlists', icon: 'queue_music' },
  { label: 'Compartido conmigo', icon: 'share' },
  { label: 'Recientes', icon: 'history' },
  { label: 'Tendencias', icon: 'local_fire_department' },
  { label: 'Admin / Planes', icon: 'manage_accounts' },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border-subtle/60 px-5">
          <span aria-hidden className="material-symbols-outlined grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent-cyan text-[20px] text-white shadow-md shadow-primary/20">
            lock
          </span>
          <div className="flex flex-col">
            <span className="font-display text-[18px] font-bold leading-tight tracking-tight text-white">MusicLock</span>
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-accent-cyan">Client-side encrypted</span>
          </div>
        </div>

        <div className="px-5 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-border-blue/60 bg-surface-card px-2.5 py-1.5 text-accent-cyan">
            <span aria-hidden className="material-symbols-outlined text-[16px]">verified_user</span>
            <span className="font-mono text-[11px] font-medium tracking-wide">AES-GCM 256 VAULT</span>
          </div>
        </div>

        <nav aria-label="Secciones" className="mt-1 flex flex-col gap-1 px-3">
          {NAV.map((item) =>
            item.to ? (
              <NavLink
                key={item.label}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-title-sm transition-all ${
                    isActive ? 'bg-primary-container/60 font-semibold text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-card hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span aria-hidden className={`material-symbols-outlined text-[20px] ${isActive ? 'text-accent-cyan' : ''}`}>
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ) : (
              <span
                key={item.label}
                aria-disabled="true"
                title="Disponible después del MVP"
                className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3.5 py-2.5 text-title-sm text-on-surface-variant/50"
              >
                <span aria-hidden className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <span className="rounded bg-surface-card px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">Pronto</span>
              </span>
            ),
          )}
        </nav>
      </div>

      <div className="p-4">
        <StorageMeter />
      </div>
    </div>
  )
}
