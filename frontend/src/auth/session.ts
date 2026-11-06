import { createContext, useContext } from 'react'

import type { User } from '../api/auth'

/**
 * Estados de la sesión:
 * - loading:   comprobando si hay una sesión guardada (al cargar la página).
 * - anonymous: sin sesión.
 * - locked:    hay sesión (JWT válido) pero la Master Key no está en memoria,
 *              p. ej. tras recargar la página. Hay que volver a pedir la
 *              contraseña (el día 5 se añade la pantalla "Desbloquear bóveda").
 * - ready:     sesión y Master Key disponibles: se puede cifrar y descifrar.
 */
export type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'locked'; user: User }
  | { status: 'ready'; user: User; masterKey: CryptoKey }

export interface AuthContextValue {
  session: Session
  login(email: string, password: string): Promise<void>
  register(email: string, username: string, password: string): Promise<void>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return value
}
