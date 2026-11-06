/**
 * Almacén de tokens JWT.
 *
 * - access token: solo en memoria (dura 15 min; se renueva solo).
 * - refresh token: en localStorage, para que la sesión sobreviva a una recarga.
 *   Riesgo conocido: un XSS podría leerlo. Mejora futura: cookie httpOnly
 *   (ver docs/desarrollo/README.md, deuda técnica).
 *
 * Ninguno de los dos sirve para descifrar: la Master Key nunca se guarda aquí.
 */

const REFRESH_KEY = 'musiclock.refresh'

let accessToken: string | null = null

function readRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null // almacenamiento bloqueado (modo privado, políticas del navegador)
  }
}

export const tokenStore = {
  getAccess: (): string | null => accessToken,
  getRefresh: readRefresh,

  set(tokens: { access: string; refresh?: string }): void {
    accessToken = tokens.access
    if (tokens.refresh) {
      try {
        localStorage.setItem(REFRESH_KEY, tokens.refresh)
      } catch {
        // Sin almacenamiento la sesión funciona igual, pero no sobrevive a una recarga.
      }
    }
  },

  clear(): void {
    accessToken = null
    try {
      localStorage.removeItem(REFRESH_KEY)
    } catch {
      // nada que limpiar
    }
  },
}
