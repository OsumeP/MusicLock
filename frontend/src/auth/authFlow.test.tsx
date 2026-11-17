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
import { publicKeyFingerprint, unlockPrivateKey } from '../crypto'
import { clearMasterKey, loadMasterKey } from './keyStore'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { AppLayout } from '../layout/AppLayout'
import { AccountPage } from '../pages/AccountPage'
import { HomePage } from '../pages/HomePage'
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
  keypair?: { public_key: string; wrapped_private_key: string; private_key_iv: string }
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
    has_keypair: !!u.keypair,
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

    switch (url.split('?')[0]) {
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
      case '/api/songs':
        return auth ? json({ count: 0, next: null, previous: null, results: [] }) : json({ detail: 'auth' }, 401)
      case '/api/me/keypair': {
        const u = [...users.values()][0]
        if (!auth || !u) return json({ detail: 'auth' }, 401)
        if (init?.method === 'PUT') {
          if (u.keypair) return json({ detail: 'x', code: 'keypair_exists' }, 409)
          u.keypair = body
          return json(body, 201)
        }
        return u.keypair ? json(u.keypair) : json({ detail: 'x', code: 'no_keypair' }, 404)
      }
      case '/api/me/vault': {
        const u = [...users.values()][0]
        if (!auth || !u) return json({ detail: 'auth' }, 401)
        if (u.auth_key !== body.auth_key) return json({ detail: 'x', code: 'invalid_password' }, 400)
        const { kdf_salt, kdf_params, wrapped_master_key, master_key_iv } = u
        return json({ kdf_salt, kdf_params, wrapped_master_key, master_key_iv })
      }
      case '/api/me/password': {
        const u = [...users.values()][0]
        if (!auth || !u) return json({ detail: 'auth' }, 401)
        if (u.auth_key !== body.current_auth_key) return json({ detail: 'x', code: 'invalid_password' }, 400)
        validRefresh.clear() // se cierran todas las sesiones
        Object.assign(u, {
          auth_key: body.new_auth_key,
          kdf_salt: body.kdf_salt,
          kdf_params: body.kdf_params,
          wrapped_master_key: body.wrapped_master_key,
          master_key_iv: body.master_key_iv,
        })
        return json(session(u))
      }
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
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="/inicio" element={<HomePage />} />
            <Route path="/cuenta" element={<AccountPage />} />
          </Route>
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
  await screen.findByRole('heading', { name: 'Hola, ana' }, { timeout: 5000 })
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

    expect(screen.getByText('ana@example.com')).toBeInTheDocument() // usuario en la barra superior
    expect(await screen.findByText('Aún no tienes canciones')).toBeInTheDocument()
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
    renderApp('/inicio')
  }

  it('tras recargar la página la bóveda sigue abierta (Master Key en IndexedDB)', async () => {
    await registerAna()

    reload()

    expect(await screen.findByRole('heading', { name: 'Hola, ana' })).toBeInTheDocument()
    expect(server.requests.filter((r) => r.url === '/api/auth/login')).toHaveLength(0)
  })

  it('si el servidor no responde al recargar, no cierra la sesión: reintenta hasta que vuelve', async () => {
    await registerAna()
    let serverDown = true
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
      serverDown && url === '/api/auth/refresh' ? new Response('Bad Gateway', { status: 502 }) : server.fetch(url, init),
    )

    reload()

    expect(await screen.findByText(/No se pudo conectar con el servidor\. Reintentando/)).toBeInTheDocument()
    expect(localStorage.getItem('musiclock.refresh')).not.toBeNull() // la sesión sigue guardada
    serverDown = false
    expect(await screen.findByRole('heading', { name: 'Hola, ana' }, { timeout: 4000 })).toBeInTheDocument()
    expect(server.requests.filter((r) => r.url === '/api/auth/login')).toHaveLength(0) // sin pedir la contraseña
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

    expect(await screen.findByRole('heading', { name: 'Hola, ana' }, { timeout: 5000 })).toBeInTheDocument()
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

  describe('cambio de contraseña', () => {
    const NEW_PASSWORD = 'Otra frase distinta y larga 2026'

    async function openAccount(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('link', { name: /mi cuenta/i }))
      await screen.findByRole('heading', { name: 'Cambiar contraseña' })
    }

    async function login(user: ReturnType<typeof userEvent.setup>, password: string) {
      await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com')
      await user.type(screen.getByLabelText('Contraseña'), password)
      await user.click(screen.getByRole('button', { name: /^iniciar sesión$/i }))
    }

    it('re-envuelve la Master Key: la nueva contraseña abre la bóveda y la anterior ya no', async () => {
      const user = userEvent.setup()
      await registerAna(user)
      const before = { ...server.users.get('ana@example.com')! }
      const oldRefresh = tokenStore.getRefresh()
      await openAccount(user)

      await user.type(screen.getByLabelText('Contraseña actual'), PASSWORD)
      await user.type(screen.getByLabelText('Nueva contraseña'), NEW_PASSWORD)
      await user.type(screen.getByLabelText('Confirmar nueva contraseña'), NEW_PASSWORD)
      await user.click(screen.getByRole('button', { name: /^cambiar contraseña$/i }))

      expect(await screen.findByText(/Contraseña cambiada/, {}, { timeout: 8000 })).toBeInTheDocument()
      const after = server.users.get('ana@example.com')!
      expect(after.kdf_salt).not.toBe(before.kdf_salt)
      expect(after.auth_key).not.toBe(before.auth_key)
      expect(after.wrapped_master_key).not.toBe(before.wrapped_master_key)
      // La sesión de este navegador sigue con tokens nuevos; nunca viajó ninguna contraseña.
      expect(tokenStore.getRefresh()).not.toBe(oldRefresh)
      expect(await loadMasterKey(1)).not.toBeNull()
      expect(JSON.stringify(server.requests)).not.toContain(PASSWORD)
      expect(JSON.stringify(server.requests)).not.toContain(NEW_PASSWORD)

      await user.click(screen.getByRole('button', { name: /cerrar sesión/i }))
      await login(user, PASSWORD)
      expect(await screen.findByText('Correo o contraseña incorrectos.', {}, { timeout: 5000 })).toBeInTheDocument()

      await user.clear(screen.getByLabelText('Contraseña'))
      await user.type(screen.getByLabelText('Contraseña'), NEW_PASSWORD)
      await user.click(screen.getByRole('button', { name: /^iniciar sesión$/i }))
      // Vuelve a donde estaba (Mi cuenta), con la bóveda abierta.
      expect(await screen.findByRole('heading', { name: 'Mi cuenta' }, { timeout: 5000 })).toBeInTheDocument()
    }, 20_000)

    it('con la contraseña actual incorrecta no cambia nada', async () => {
      const user = userEvent.setup()
      await registerAna(user)
      await waitFor(() => expect(server.users.get('ana@example.com')!.keypair).toBeDefined(), { timeout: 10_000 })
      const before = { ...server.users.get('ana@example.com')! }
      await openAccount(user)

      await user.type(screen.getByLabelText('Contraseña actual'), 'no es la contraseña')
      await user.type(screen.getByLabelText('Nueva contraseña'), NEW_PASSWORD)
      await user.type(screen.getByLabelText('Confirmar nueva contraseña'), NEW_PASSWORD)
      await user.click(screen.getByRole('button', { name: /^cambiar contraseña$/i }))

      expect(await screen.findByText('La contraseña actual no es correcta.', {}, { timeout: 5000 })).toBeInTheDocument()
      expect(server.users.get('ana@example.com')).toEqual(before)
      expect(server.requests.some((r) => r.url === '/api/me/password')).toBe(false)
      expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument() // la sesión sigue
    }, 15_000)

    it('valida en el navegador: nueva igual a la actual, débil o sin confirmar', async () => {
      const user = userEvent.setup()
      await registerAna(user)
      await openAccount(user)

      await user.type(screen.getByLabelText('Contraseña actual'), PASSWORD)
      await user.type(screen.getByLabelText('Nueva contraseña'), PASSWORD)
      await user.type(screen.getByLabelText('Confirmar nueva contraseña'), PASSWORD)
      await user.click(screen.getByRole('button', { name: /^cambiar contraseña$/i }))
      expect(screen.getByText('Debe ser distinta de la contraseña actual.')).toBeInTheDocument()

      await user.clear(screen.getByLabelText('Nueva contraseña'))
      await user.type(screen.getByLabelText('Nueva contraseña'), 'corta')
      expect(screen.getByText(/al menos 12 caracteres/)).toBeInTheDocument()
      expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
      expect(server.requests.some((r) => r.url === '/api/me/vault' || r.url === '/api/me/password')).toBe(false)
    }, 15_000)
  })

  describe('par de claves para compartir (día 16)', () => {
    it('al abrir la bóveda se genera y guarda el par; la privada solo la abre la Master Key', async () => {
      const user = userEvent.setup()
      await registerAna(user)

      await waitFor(() => expect(server.users.get('ana@example.com')!.keypair).toBeDefined(), { timeout: 10_000 })
      const stored = server.users.get('ana@example.com')!.keypair!
      expect(server.requests.filter((r) => r.url === '/api/me/keypair')).toHaveLength(1)
      // Lo guardado se abre con la Master Key de esta sesión (IndexedDB).
      const masterKey = (await loadMasterKey(1))!
      await expect(unlockPrivateKey(stored.wrapped_private_key, stored.private_key_iv, masterKey)).resolves.toBeDefined()

      // "Mi cuenta" muestra la huella de esa clave pública.
      await user.click(screen.getByRole('link', { name: /mi cuenta/i }))
      expect(await screen.findByText(await publicKeyFingerprint(stored.public_key), {}, { timeout: 5000 })).toBeInTheDocument()
    }, 20_000)

    it('una cuenta anterior al día 16 lo genera al iniciar sesión', async () => {
      const user = userEvent.setup()
      await registerAna(user)
      await waitFor(() => expect(server.users.get('ana@example.com')!.keypair).toBeDefined(), { timeout: 10_000 })
      const first = server.users.get('ana@example.com')!.keypair!
      await user.click(screen.getByRole('button', { name: /cerrar sesión/i }))

      // Simula una cuenta antigua: sin par de claves.
      delete server.users.get('ana@example.com')!.keypair
      await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com')
      await user.type(screen.getByLabelText('Contraseña'), PASSWORD)
      await user.click(screen.getByRole('button', { name: /^iniciar sesión$/i }))

      await waitFor(() => expect(server.users.get('ana@example.com')!.keypair).toBeDefined(), { timeout: 10_000 })
      expect(server.users.get('ana@example.com')!.keypair!.public_key).not.toBe(first.public_key)
      expect(server.requests.filter((r) => r.url === '/api/me/keypair')).toHaveLength(2)
    }, 25_000)
  })
})
