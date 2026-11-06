import { useEffect, useState } from 'react'

import { fetchHealth, type HealthResponse } from '../api/health'

type CheckState = 'loading' | 'ok' | 'error'

type HealthState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: HealthResponse }
  | { kind: 'unreachable' }

const STATE_STYLES: Record<CheckState, { label: string; dot: string; text: string }> = {
  loading: { label: 'Comprobando…', dot: 'bg-on-surface-variant animate-pulse', text: 'text-on-surface-variant' },
  ok: { label: 'Operativo', dot: 'bg-accent-cyan', text: 'text-accent-cyan' },
  error: { label: 'Sin conexión', dot: 'bg-security-danger', text: 'text-security-danger' },
}

function StatusRow({ icon, name, detail, state }: { icon: string; name: string; detail: string; state: CheckState }) {
  const style = STATE_STYLES[state]
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <span className="material-symbols-outlined grid size-10 place-items-center rounded bg-primary-container text-primary-light">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-title-sm font-semibold">{name}</p>
        <p className="truncate font-mono text-mono-crypto text-on-surface-variant">{detail}</p>
      </div>
      <span className={`flex items-center gap-2 font-mono text-mono-crypto ${style.text}`}>
        <span className={`size-2 rounded-full ${style.dot}`} />
        {style.label}
      </span>
    </li>
  )
}

/**
 * Página temporal de los días 1–2: comprueba que frontend → proxy de Vite →
 * Django → PostgreSQL y MinIO están conectados. Se reemplaza por la landing
 * page en el día 9.
 */
export function SystemStatusPage() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((data) => setHealth({ kind: 'loaded', data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error)
          setHealth({ kind: 'unreachable' })
        }
      })
    return () => controller.abort()
  }, [])

  const apiState: CheckState =
    health.kind === 'loading' ? 'loading' : health.kind === 'loaded' ? 'ok' : 'error'

  const checkState = (check: 'database' | 'storage'): CheckState =>
    health.kind === 'loading'
      ? 'loading'
      : health.kind === 'loaded' && health.data[check] === 'ok'
        ? 'ok'
        : 'error'

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-4 py-12">
      <header className="flex items-center gap-3">
        <span className="material-symbols-outlined grid size-11 place-items-center rounded-md bg-primary text-on-surface">
          lock
        </span>
        <div>
          <h1 className="font-display text-headline-md font-semibold">MusicLock</h1>
          <p className="font-mono text-mono-label uppercase tracking-widest text-primary-light">
            Client-side encrypted
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="font-display text-headline-sm font-medium">Estado del sistema</h2>
          <p className="text-body-md text-on-surface-variant">
            Verificación de la infraestructura del MVP (días 1–2).
          </p>
        </div>
        <ul className="divide-y divide-border-subtle">
          <StatusRow icon="web" name="Frontend" detail="React + TypeScript · Vite" state="ok" />
          <StatusRow icon="dns" name="API" detail="Django + DRF · GET /api/health" state={apiState} />
          <StatusRow icon="database" name="Base de datos" detail="PostgreSQL" state={checkState('database')} />
          <StatusRow
            icon="cloud"
            name="Almacenamiento cifrado"
            detail="MinIO · puerto BlobStorage"
            state={checkState('storage')}
          />
        </ul>
      </section>
    </main>
  )
}
