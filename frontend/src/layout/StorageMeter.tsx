import { useAuth } from '../auth/session'
import { formatBytes } from '../lib/format'

/** Cuota usada / disponible del plan (Interfaz FR-06). */
export function StorageMeter({ compact = false }: { compact?: boolean }) {
  const { session } = useAuth()
  if (session.status !== 'ready') return null
  const { usedStorage, plan } = session.user
  const percent = Math.min(100, (usedStorage / plan.maxStorageBytes) * 100)
  const nearlyFull = percent >= 90

  return (
    <div className={compact ? '' : 'rounded-xl bg-surface-card p-4 ring-1 ring-border-subtle'}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-mono-crypto text-on-surface">Bóveda cifrada · {plan.name}</span>
        <span className={`font-mono text-mono-crypto ${nearlyFull ? 'text-security-warning' : 'text-accent-cyan'}`}>
          {percent < 1 && usedStorage > 0 ? '<1' : Math.round(percent)}%
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-container-high"
        role="meter"
        aria-label="Almacenamiento usado"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full ${nearlyFull ? 'bg-security-warning' : 'bg-gradient-to-r from-primary to-accent-cyan'}`}
          style={{ width: `${Math.max(percent, usedStorage > 0 ? 1 : 0)}%` }}
        />
      </div>
      <p className="mt-2 text-body-sm text-on-surface-variant">
        {formatBytes(usedStorage)} de {formatBytes(plan.maxStorageBytes)} usados
      </p>
    </div>
  )
}
