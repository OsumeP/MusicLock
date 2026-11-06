import { Link } from 'react-router'

import { useAuth } from '../auth/session'

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/**
 * Página temporal del día 4: confirma que la sesión y la Master Key están
 * activas. El día 6 se reemplaza por el layout completo y "Mis Archivos".
 */
export function VaultHomePage() {
  const { session, logout } = useAuth()
  if (session.status !== 'ready') return null
  const { user } = session
  const usedPercent = Math.min(100, (user.usedStorage / user.plan.maxStorageBytes) * 100)

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="material-symbols-outlined grid size-11 place-items-center rounded-md bg-primary">lock_open</span>
          <div>
            <h1 className="font-display text-headline-md font-semibold">Hola, {user.username}</h1>
            <p className="font-mono text-mono-crypto text-on-surface-variant">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-title-sm text-on-surface-variant ring-1 ring-border-subtle hover:text-on-surface"
        >
          <span aria-hidden className="material-symbols-outlined text-[18px]">logout</span>
          Cerrar sesión
        </button>
      </header>

      <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-5 ring-1 ring-border-subtle">
        <p className="flex items-center gap-2 font-mono text-mono-crypto text-accent-cyan">
          <span className="size-2 rounded-full bg-accent-cyan" />
          Bóveda desbloqueada · Master Key AES-256 en memoria (no extraíble)
        </p>
        <div>
          <div className="mb-2 flex justify-between text-body-md">
            <span>Plan {user.plan.name}</span>
            <span className="font-mono text-mono-crypto text-primary-light">
              {formatBytes(user.usedStorage)} / {formatBytes(user.plan.maxStorageBytes)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
            <div className="h-full rounded-full bg-primary-light" style={{ width: `${usedPercent}%` }} />
          </div>
        </div>
        <p className="text-body-md text-on-surface-variant">
          Aquí aparecerán tus archivos cifrados (día 6). Máximo {formatBytes(user.plan.maxFileSizeBytes)} por archivo.
        </p>
      </section>

      <Link to="/estado" className="text-center text-body-sm text-on-surface-variant hover:text-on-surface">
        Estado del sistema
      </Link>
    </main>
  )
}
