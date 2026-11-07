import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiRequest, onSessionExpired, ServerUnavailableError } from './client'
import { tokenStore } from './tokens'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization
}

describe('apiRequest', () => {
  beforeEach(() => {
    tokenStore.clear()
    tokenStore.set({ access: 'access-viejo', refresh: 'refresh-1' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('envía el access token y devuelve el JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiRequest('/me')).resolves.toEqual({ ok: true })
    expect(authHeader(fetchMock.mock.calls[0][1])).toBe('Bearer access-viejo')
  })

  it('ante un 401 renueva el token una vez y repite la petición', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/refresh') return json({ access: 'access-nuevo', refresh: 'refresh-2' })
      return authHeader(init) === 'Bearer access-nuevo' ? json({ ok: true }) : json({ detail: 'expired' }, 401)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiRequest('/me')).resolves.toEqual({ ok: true })
    expect(tokenStore.getAccess()).toBe('access-nuevo')
    expect(tokenStore.getRefresh()).toBe('refresh-2') // rotación
  })

  it('varias peticiones con 401 simultáneas comparten una sola renovación', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/refresh') return json({ access: 'access-nuevo', refresh: 'refresh-2' })
      return authHeader(init) === 'Bearer access-nuevo' ? json({ ok: true }) : json({}, 401)
    })
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([apiRequest('/a'), apiRequest('/b'), apiRequest('/c')])

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/auth/refresh')
    expect(refreshCalls).toHaveLength(1)
  })

  it('si otra pestaña ya rotó el refresh token, reintenta con el nuevo en lugar de cerrar la sesión', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/refresh') {
        const { refresh } = JSON.parse(init!.body as string)
        if (refresh === 'refresh-1') {
          // Mientras tanto otra pestaña renovó y guardó su token nuevo en localStorage.
          localStorage.setItem('musiclock.refresh', 'refresh-de-otra-pestaña')
          return json({ detail: 'blacklisted' }, 401)
        }
        return json({ access: 'access-nuevo', refresh: 'refresh-3' })
      }
      return authHeader(init) === 'Bearer access-nuevo' ? json({ ok: true }) : json({}, 401)
    })
    vi.stubGlobal('fetch', fetchMock)
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)

    await expect(apiRequest('/me')).resolves.toEqual({ ok: true })

    expect(expired).not.toHaveBeenCalled()
    expect(tokenStore.getRefresh()).toBe('refresh-3')
    unsubscribe()
  })

  it.each([
    ['un 502 del proxy', () => Promise.resolve(new Response('Bad Gateway', { status: 502 }))],
    ['un 503', () => Promise.resolve(json({ detail: 'down' }, 503))],
    ['un error de red', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('si el servidor no responde a la renovación (%s), conserva la sesión y falla la petición', async (_, refreshResponse) => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url === '/api/auth/refresh' ? refreshResponse() : Promise.resolve(json({}, 401)))),
    )
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)

    await expect(apiRequest('/me')).rejects.toBeInstanceOf(ServerUnavailableError)

    expect(expired).not.toHaveBeenCalled()
    expect(tokenStore.getRefresh()).toBe('refresh-1')
    unsubscribe()
  })

  it('si la renovación falla, borra los tokens y avisa que la sesión expiró', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'no' }, 401)))
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)

    await expect(apiRequest('/me')).rejects.toBeInstanceOf(ApiError)

    expect(expired).toHaveBeenCalledOnce()
    expect(tokenStore.getAccess()).toBeNull()
    expect(tokenStore.getRefresh()).toBeNull()
    unsubscribe()
  })

  it('las peticiones sin sesión (login) no envían token ni intentan renovar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ detail: 'Correo o contraseña incorrectos.', code: 'invalid_credentials' }, 401))
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiRequest('/auth/login', { json: {}, auth: false }).catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 401, code: 'invalid_credentials' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(authHeader(fetchMock.mock.calls[0][1])).toBeUndefined()
    expect(tokenStore.getRefresh()).toBe('refresh-1')
  })

  it('expone los errores por campo de DRF', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ email: ['Ya existe una cuenta con este correo.'] }, 400)))

    const error = (await apiRequest('/auth/register', { json: {}, auth: false }).catch((e: unknown) => e)) as ApiError

    expect(error.fieldErrors).toEqual({ email: ['Ya existe una cuenta con este correo.'] })
  })
})
