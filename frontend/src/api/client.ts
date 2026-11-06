/**
 * Cliente HTTP de la API.
 *
 * - Rutas relativas (/api/...): en desarrollo las resuelve el proxy de Vite.
 * - Añade el JWT a las peticiones autenticadas.
 * - Si la API responde 401, renueva el access token UNA vez con el refresh token
 *   y repite la petición (FR-03). Varias peticiones que fallen a la vez comparten
 *   una sola renovación.
 * - Si la renovación falla, la sesión terminó: se limpian los tokens y se avisa
 *   a quien escuche `onSessionExpired` (el AuthProvider).
 */

import { tokenStore } from './tokens'

export class ApiError extends Error {
  readonly status: number
  /** Código de error de la API (p. ej. "invalid_credentials"), si lo hay. */
  readonly code?: string
  /** Errores por campo de los serializers de DRF: {"email": ["..."]}. */
  readonly fieldErrors: Record<string, string[]>

  constructor(status: number, message: string, code?: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Se envía como JSON. */
  json?: unknown
  /** Por defecto las peticiones llevan el JWT; las de login/registro no. */
  auth?: boolean
  signal?: AbortSignal
}

type Listener = () => void
const sessionExpiredListeners = new Set<Listener>()

export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener)
  return () => sessionExpiredListeners.delete(listener)
}

let refreshInFlight: Promise<boolean> | null = null

/** Renueva el access token. Devuelve false si la sesión ya no es válida. */
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refresh = tokenStore.getRefresh()
    if (!refresh) return false
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      if (!response.ok) return false
      const tokens = (await response.json()) as { access: string; refresh?: string }
      tokenStore.set(tokens)
      return true
    } catch {
      return false
    }
  })().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // respuesta sin JSON
  }
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const detail = typeof record.detail === 'string' ? record.detail : `Error ${response.status}`
  const code = typeof record.code === 'string' ? record.code : undefined
  const fieldErrors: Record<string, string[]> = {}
  for (const [field, value] of Object.entries(record)) {
    if (Array.isArray(value)) fieldErrors[field] = value.map(String)
  }
  return new ApiError(response.status, detail, code, fieldErrors)
}

function buildRequest(options: RequestOptions): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.json !== undefined) headers['Content-Type'] = 'application/json'
  const access = tokenStore.getAccess()
  if (options.auth !== false && access) headers.Authorization = `Bearer ${access}`
  return {
    method: options.method ?? (options.json === undefined ? 'GET' : 'POST'),
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    signal: options.signal,
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `/api${path}`
  let response = await fetch(url, buildRequest(options))

  if (response.status === 401 && options.auth !== false) {
    if (await refreshAccessToken()) {
      response = await fetch(url, buildRequest(options))
    } else {
      tokenStore.clear()
      sessionExpiredListeners.forEach((listener) => listener())
    }
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
