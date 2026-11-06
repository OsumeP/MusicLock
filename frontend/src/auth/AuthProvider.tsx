import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import * as authApi from '../api/auth'
import { onSessionExpired, refreshAccessToken } from '../api/client'
import { tokenStore } from '../api/tokens'
import { createVault, prepareLogin } from '../crypto'
import { AuthContext, type AuthContextValue, type Session } from './session'

/**
 * Orquesta el registro, el login y el logout uniendo la API y el módulo crypto
 * (PlanMVP §4.3). La Master Key vive solo en memoria, dentro de este estado.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' })

  // Al cargar la página: ¿hay una sesión guardada? Sin Master Key → "locked".
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!tokenStore.getRefresh() || !(await refreshAccessToken())) {
        tokenStore.clear()
        if (!cancelled) setSession({ status: 'anonymous' })
        return
      }
      try {
        const user = await authApi.fetchMe()
        if (!cancelled) setSession({ status: 'locked', user })
      } catch {
        tokenStore.clear()
        if (!cancelled) setSession({ status: 'anonymous' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Si el refresh token deja de servir (logout en otra pestaña, cuenta bloqueada…)
  useEffect(() => onSessionExpired(() => setSession({ status: 'anonymous' })), [])

  const login = useCallback(async (email: string, password: string) => {
    const { kdfSalt, kdfParams } = await authApi.prelogin(email)
    const pending = await prepareLogin(password, kdfSalt, kdfParams)
    const result = await authApi.login(email, pending.authKey)
    // El servidor ya validó el authKey, así que la Master Key debe abrir; si no,
    // los datos de la cuenta están corruptos y no se inicia sesión.
    const masterKey = await pending.unlock(result.wrappedMasterKey, result.masterKeyIv)
    tokenStore.set(result)
    setSession({ status: 'ready', user: result.user, masterKey })
  }, [])

  const register = useCallback(async (email: string, username: string, password: string) => {
    const { registration, masterKey } = await createVault(password)
    const result = await authApi.register(email, username, registration)
    tokenStore.set(result)
    setSession({ status: 'ready', user: result.user, masterKey })
  }, [])

  const logout = useCallback(async () => {
    const refresh = tokenStore.getRefresh()
    tokenStore.clear()
    setSession({ status: 'anonymous' })
    if (refresh) {
      await authApi.logout(refresh).catch(() => {
        // Aunque falle la red, localmente la sesión ya se cerró.
      })
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ session, login, register, logout }), [session, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
