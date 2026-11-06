/**
 * Prueba de integración del flujo de autenticación: pantallas reales + módulo
 * crypto real + un servidor falso en memoria que se comporta como la API de
 * Django (guarda solo lo que guardaría el backend).
 */
import 'fake-indexeddb/auto'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory } from 'fake-indexeddb'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { tokenStore } from '../api/tokens'
import { clearMasterKey, loadMasterKey } from './keyStore'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { VaultHomePage } from '../pages/VaultHomePage'
import { AuthProvider } from './AuthProvider'
import { RequireAuth } from './RequireAuth'

const PASSWORD = 'Una frase muy segura 2026!'

interface StoredUser {
  email: string
  username: string
  auth_key: string
  kdf_salt: string
  kdf_params: unknown
  wrapped_master_key: string
  master_key_iv: string
  active: boolean
}

/** Servidor falso: misma forma de respuestas que la API de Django. */
function createFakeServer() {
  const users = new Map<string, StoredUser>()
  const requests: { url: string; body: unknown }[] = []
  let refreshCounter = 0
  const validRefresh = new Set<string>()

  const json = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status })
  const userDto = (u: StoredUser) => ({
    id: 1,
    email: u.email,
    username: u.username,
    plan: { code: 'free', name: 'Free', max_storage_bytes: 500 * 1024 * 1024, max_file_size_bytes: 20 * 1024 * 1024 },
    used_storage: 0,
    storage_available: 500 * 1024 * 1024,
  })
  const session = (u: StoredUser) => {
    const refresh = `refresh-${++refreshCounter}`
    validRefresh.add(refresh)
    return {
      access: `access-${u.email}`,
      refresh,
      user: userDto(u),
      vault: { wrapped_master_key: u.wrapped_master_key, master_key_iv: u.master_key_iv },
    }
  }

  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null
    requests.push({ url, body })
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization

    switch (url) {
      case '/api/auth/prelogin': {
        const u = users.get(body.email)
        return json(u ? { kdf_salt: u.kdf_salt, kdf_params: u.kdf_params } : { kdf_salt: 'AAAAAAAAAAAAAAAAAAAAAA==', kdf_params: { alg: 'PBKDF2-SHA256', iterations: 600000 } })
      }
      case '/api/auth/register': {
        if (users.has(body.email)) return json({ email: ['Ya existe una cuenta con este correo.'] }, 400)
        const u: StoredUser = { ...body, active: true }
        users.set(body.email, u)
        return json(session(u), 201)
      }
      case '/api/auth/login': {
        const u = users.get(body.email)
        if (!u || u.auth_key !== body.auth_key) return json({ detail: 'x', code: 'invalid_credentials' }, 401)
        if (!u.active) return json({ detail: 'x', code: 'account_blocked' }, 403)
        return json(session(u))
      }
      case '/api/auth/refresh': {
        if (!validRefresh.has(body.refresh)) return json({ detail: 'invalid' }, 401)
        validRefresh.delete(body.refresh)
        const next = `refresh-${++refreshCounter}`
        validRefresh.add(next)
        return json({ access: 'access-renovado', refresh: next })
      }
      case '/api/auth/logout':
        validRefresh.delete(body.refresh)
        return json(null, 204)
      case '/api/me': {
        const u = [...users.values()][0]
        return auth && u ? json(userDto(u)) : json({ detail: 'auth' }, 401)
      }
    }
    return json({ detail: 'not found' }, 404)
  })

  return { fetch, users, requests }
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/" element={<RequireAuth><VaultHomePage /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function registerAna(user = userEvent.setup()) {
  renderApp('/registro')
  await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com')
  await user.type(screen.getByLabelText('Nombre de usuario'), 'ana')
  await user.type(screen.getByLabelText('Contraseña'), PASSWORD)
  await user.type(screen.getByLabelText('Confirmar contraseña'), PASSWORD)
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: /crear cuenta cifrada/i }))
  await screen.findByText('Hola, ana', {}, { timeout: 5000 })
}

describe('flujo de autenticación', () => {
  let server: ReturnType<typeof createFakeServer>

  beforeEach(() => {
    tokenStore.clear()
    globalThis.indexedDB = new IDBFactory() // IndexedDB vacío en cada test
    server = createFakeServer()
    vi.stubGlobal('fetch', server.fetch)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('registro: entra a la bóveda y el servidor nunca recibe la contraseña', async () => {
    await registerAna()

    expect(screen.getByText(/Bóveda desbloqueada/)).toBeInTheDocument()
    expect(JSON.stringify(server.requests)).not.toContain(PASSWORD)
    const stored = server.users.get('ana@example.com')!
    expect(stored.kdf_params).toEqual({ alg: 'PBKDF2-SHA256', iterations: 600000 })
  })

  it('no deja registrarse sin aceptar la advertencia de "sin recuperación"', async () => {
    const user = userEvent.setup()
    renderApp('/registro')
    await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Nombre de usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), PASSWORD)
    await user.click(screen.getByRole('button', { name: /crear cuenta cifrada/i }))

    expect(screen.getByText('Debes aceptar para continuar.')).toBeInTheDocument()
    expect(server.requests.some((r) => r.url === '/api/auth/register')).toBe(false)
  })

  /** "Recarga": se desmonta la app y se pierde la memoria; quedan localStorage e IndexedDB. */
  function reload() {
    cleanup()
    tokenStore.set({ access: '' })
    renderApp('/')
  }

  it('tras recargar la página la bóveda sigue abierta (Master Key en IndexedDB)', async () => {
    await registerAna()

    reload()

    expect(await screen.findByText('Hola, ana')).toBeInTheDocument()
    expect(server.requests.filter((r) => r.url === '/api/auth/login')).toHaveLength(0)
  })

  it('si IndexedDB no tiene la clave, la bóveda queda bloqueada y se abre con la contraseña', async () => {
    const user = userEvent.setup()
    await registerAna(user)
    await clearMasterKey() // p. ej. el usuario borró los datos del sitio

    reload()

    expect(await screen.findByText(/Tu bóveda está bloqueada/)).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), PASSWORD)
    await user.click(screen.getByRole('button', { name: /desbloquear bóveda/i }))

    expect(await screen.findByText('Hola, ana', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('login con contraseña incorrecta muestra un error y no entra', async () => {
    const user = userEvent.setup()
    await registerAna(user)
    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }))

    await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'otra contraseña larga')
    await user.click(screen.getByRole('button', { name: /^iniciar sesión$/i }))

    expect(await screen.findByText('Correo o contraseña incorrectos.', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('logout invalida el refresh token en el servidor', async () => {
    const user = userEvent.setup()
    await registerAna(user)
    const refresh = tokenStore.getRefresh()

    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }))

    await waitFor(() => expect(server.requests.at(-1)).toEqual({ url: '/api/auth/logout', body: { refresh } }))
    expect(tokenStore.getRefresh()).toBeNull()
    expect(await loadMasterKey(1)).toBeNull() // la Master Key se borró de IndexedDB
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('una cuenta bloqueada no puede entrar', async () => {
    const user = userEvent.setup()
    await registerAna(user)
    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    server.users.get('ana@example.com')!.active = false

    await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), PASSWORD)
    await user.click(screen.getByRole('button', { name: /^iniciar sesión$/i }))

    expect(await screen.findByText(/cuenta está bloqueada/, {}, { timeout: 5000 })).toBeInTheDocument()
  })
})
