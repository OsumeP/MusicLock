import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import * as authApi from '../api/auth'
import { ApiError, onSessionExpired, refreshAccessToken } from '../api/client'
import { tokenStore } from '../api/tokens'
import { createKeyPair, createVault, prepareLogin, prepareRewrap } from '../crypto'
import { clearMasterKey, loadMasterKey, saveMasterKey } from './keyStore'
import { AuthContext, type AuthContextValue, type Session } from './session'

/** Espera máxima entre reintentos al restaurar la sesión con el servidor caído. */
const RESTORE_MAX_DELAY_MS = 10_000

/**
 * Orquesta el registro, el login y el logout uniendo la API y el módulo crypto
 * (PlanMVP §4.3). La Master Key (no extraíble) vive en este estado y se
 * persiste en IndexedDB para sobrevivir a una recarga (PlanMVP §4.4).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' })
  /** Id del usuario cuyo par de claves ya se generó o se está generando (día 16). */
  const keyPairUser = useRef<number | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Al cargar la página: ¿hay sesión guardada? ¿y Master Key en IndexedDB?
  // Si el servidor no responde (p. ej. se está reiniciando), NO se cierra la
  // sesión: se reintenta con espera creciente mostrando "Reintentando…".
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (let attempt = 0; !cancelled; attempt++) {
        try {
          if (!tokenStore.getRefresh() || !(await refreshAccessToken())) {
            tokenStore.clear()
            await clearMasterKey()
            if (!cancelled) setSession({ status: 'anonymous' })
            return
          }
          const user = await authApi.fetchMe()
          const masterKey = await loadMasterKey(user.id)
          if (!cancelled) setSession(masterKey ? { status: 'ready', user, masterKey } : { status: 'locked', user })
          return
        } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            tokenStore.clear()
            if (!cancelled) setSession({ status: 'anonymous' })
            return
          }
          if (cancelled) return
          setSession({ status: 'loading', retrying: true })
          await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, RESTORE_MAX_DELAY_MS)))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Si el refresh token deja de servir (logout en otra pestaña, cuenta bloqueada…)
  useEffect(
    () =>
      onSessionExpired(() => {
        keyPairUser.current = null
        void clearMasterKey()
        setSession({ status: 'anonymous' })
      }),
    [],
  )

  // Día 16: toda cuenta necesita un par de claves para que le puedan compartir
  // canciones. Las que no lo tienen (nuevas o anteriores al día 16) lo generan en
  // segundo plano al abrir la bóveda. Si falla, se reintenta en la próxima sesión.
  useEffect(() => {
    if (session.status !== 'ready' || session.user.hasKeyPair || keyPairUser.current === session.user.id) return
    const { masterKey, user } = session
    keyPairUser.current = user.id
    void (async () => {
      try {
        const keyPair = await createKeyPair(masterKey) // RSA-3072: puede tardar unos cientos de ms
        if (!mounted.current) return
        await authApi.saveKeyPair(keyPair)
      } catch (error) {
        // 409: otra pestaña lo guardó primero. Cualquier otro error se reintenta en la próxima sesión.
        if (!(error instanceof ApiError && error.code === 'keypair_exists')) {
          keyPairUser.current = null
          return
        }
      }
      setSession((current) => (current.status === 'ready' ? { ...current, user: { ...current.user, hasKeyPair: true } } : current))
    })()
  }, [session])

  const startSession = useCallback(async (result: authApi.SessionResponse, masterKey: CryptoKey) => {
    tokenStore.set(result)
    await saveMasterKey(result.user.id, masterKey)
    setSession({ status: 'ready', user: result.user, masterKey })
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const { kdfSalt, kdfParams } = await authApi.prelogin(email)
      const pending = await prepareLogin(password, kdfSalt, kdfParams)
      const result = await authApi.login(email, pending.authKey)
      // El servidor ya validó el authKey, así que la Master Key debe abrir; si no,
      // los datos de la cuenta están corruptos y no se inicia sesión.
      const masterKey = await pending.unlock(result.wrappedMasterKey, result.masterKeyIv)
      await startSession(result, masterKey)
    },
    [startSession],
  )

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const { registration, masterKey } = await createVault(password)
      const result = await authApi.register(email, username, registration)
      await startSession(result, masterKey)
    },
    [startSession],
  )

  const logout = useCallback(async () => {
    keyPairUser.current = null
    const refresh = tokenStore.getRefresh()
    tokenStore.clear()
    await clearMasterKey()
    setSession({ status: 'anonymous' })
    if (refresh) {
      await authApi.logout(refresh).catch(() => {
        // Aunque falle la red, localmente la sesión ya se cerró.
      })
    }
  }, [])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (session.status !== 'ready') throw new Error('La bóveda no está abierta.')
      const { kdfSalt, kdfParams } = await authApi.prelogin(session.user.email)
      const change = await prepareRewrap(currentPassword, kdfSalt, kdfParams)
      const material = await authApi.fetchKeyMaterial(change.authKey)
      const registration = await change.rewrap(material.wrappedMasterKey, material.masterKeyIv, newPassword)
      const result = await authApi.changePassword(change.authKey, registration)
      // La Master Key es la misma (la de IndexedDB sigue sirviendo); solo cambian los tokens.
      tokenStore.set(result)
      setSession((current) => (current.status === 'ready' ? { ...current, user: result.user } : current))
    },
    [session],
  )

  /** Vuelve a pedir /api/me (p. ej. tras subir un archivo, para actualizar la cuota). */
  const refreshUser = useCallback(async () => {
    const user = await authApi.fetchMe()
    setSession((current) =>
      current.status === 'ready' || current.status === 'locked'
        ? // Un /api/me pedido antes de guardar el par no debe volver a marcarlo como ausente.
          { ...current, user: { ...user, hasKeyPair: user.hasKeyPair || current.user.hasKeyPair } }
        : current,
    )
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, login, register, logout, changePassword, refreshUser }),
    [session, login, register, logout, changePassword, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
