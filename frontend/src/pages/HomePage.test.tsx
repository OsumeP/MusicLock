import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { PlayerProvider } from '../player/PlayerProvider'
import { HomePage } from './HomePage'

const MiB = 1024 * 1024
const user: User = {
  id: 1,
  email: 'ana@example.com',
  username: 'ana',
  plan: { code: 'free', name: 'Free', maxStorageBytes: 500 * MiB, maxFileSizeBytes: 20 * MiB },
  usedStorage: 100 * MiB,
  storageAvailable: 400 * MiB,
  hasKeyPair: true,
}

function songDto(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Canción ${i}`, artist: '', duration: 125, size: 1000, creation_date: new Date().toISOString(),
    file_iv: 'aXY=', wrapped_file_key: 'a2V5', wrapped_key_iv: 'aXY=',
  }
}

let calls: string[]
let listResponse: () => Response
let historyResponse: () => Response

async function renderHome() {
  const auth = {
    session: { status: 'ready', user, masterKey: {} as CryptoKey },
    login: vi.fn(), register: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), refreshUser: vi.fn().mockResolvedValue(undefined),
  } as AuthContextValue
  render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </PlayerProvider>
    </AuthContext.Provider>,
  )
  return auth
}

describe('HomePage', () => {
  beforeEach(() => {
    calls = []
    listResponse = () => new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }))
    historyResponse = () => new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('/blob')) return new Response('{"code":"blob_missing"}', { status: 404 })
      return url.startsWith('/api/history') ? historyResponse() : listResponse()
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('muestra saludo, cuota y estado del cifrado; refresca la cuota al entrar', async () => {
    const auth = await renderHome()

    expect(screen.getByRole('heading', { name: 'Hola, ana' })).toBeInTheDocument()
    const quota = screen.getByRole('region', { name: 'Cuota de almacenamiento' })
    expect(within(quota).getByText('100.0 MB')).toBeInTheDocument()
    expect(within(quota).getByText('400.0 MB')).toBeInTheDocument()
    expect(within(quota).getByRole('meter')).toHaveAttribute('aria-valuenow', '20')
    expect(screen.getByText(/PBKDF2, 600\.000 iteraciones/)).toBeInTheDocument()
    expect(auth.refreshUser).toHaveBeenCalled()
    expect(await screen.findByText('Aún no tienes canciones')).toBeInTheDocument()
  })

  it('pide solo las 5 más recientes y permite reproducirlas', async () => {
    listResponse = () => new Response(JSON.stringify({ count: 12, next: 'x', previous: null, results: [1, 2, 3, 4, 5].map(songDto) }))
    const u = userEvent.setup()
    await renderHome()

    expect(await screen.findByText('Canción 1')).toBeInTheDocument()
    expect(new URL(calls[0], 'http://x').searchParams.get('page_size')).toBe('5')
    expect(screen.getByRole('link', { name: 'Ver los 12 →' })).toHaveAttribute('href', '/archivos')

    await u.click(screen.getByRole('button', { name: 'Reproducir Canción 3' }))
    expect(calls).toContain(`/api/songs/${songDto(3).id}/blob`)
  })

  it('muestra lo reproducido recientemente: 5 canciones sin repetir, con enlace al historial', async () => {
    const played = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    historyResponse = () =>
      new Response(JSON.stringify({ count: 2, next: null, previous: null, results: [7, 8].map((i) => ({ id: i, played_at: played, song: songDto(i) })) }))
    await renderHome()

    const section = screen.getByRole('region', { name: 'Reproducido recientemente' })
    expect(await within(section).findByText('Canción 7')).toBeInTheDocument()
    expect(within(section).getAllByText('hace 2 minutos')).toHaveLength(2)
    expect(within(section).getByRole('link', { name: 'Ver historial →' })).toHaveAttribute('href', '/recientes')
    const params = new URL(calls.find((c) => c.startsWith('/api/history'))!, 'http://x').searchParams
    expect([params.get('distinct'), params.get('page_size')]).toEqual(['1', '5'])
  })

  it('sin reproducciones invita a pulsar ▶', async () => {
    await renderHome()
    expect(await screen.findByText('Aún no has reproducido nada')).toBeInTheDocument()
  })
})
