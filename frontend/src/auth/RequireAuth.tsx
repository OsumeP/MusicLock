import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { FullScreenMessage } from '../components/FullScreenMessage'
import { useAuth } from './session'

/** Protege las rutas de la bóveda: solo entran sesiones con la Master Key en memoria. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()

  if (session.status === 'loading') {
    return session.retrying ? (
      <FullScreenMessage icon="cloud_off" message="No se pudo conectar con el servidor. Reintentando…" />
    ) : (
      <FullScreenMessage icon="lock_clock" message="Verificando sesión…" />
    )
  }
  if (session.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (session.status === 'locked') {
    // La Master Key no está en IndexedDB: /login en modo "Desbloquear bóveda".
    return <Navigate to="/login" replace state={{ from: location.pathname, locked: true, email: session.user.email }} />
  }
  return children
}
