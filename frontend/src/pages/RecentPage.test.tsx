import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { PlayerProvider } from '../player/PlayerProvider'
import { RecentPage } from './RecentPage'

const user: User = {
  id: 1,
  email: 'ana@example.com',
  username: 'ana',
  plan: { code: 'free', name: 'Free', maxStorageBytes: 500 * 1024 * 1024, maxFileSizeBytes: 20 * 1024 * 1024 },
  usedStorage: 0,
  storageAvailable: 500 * 1024 * 1024,
  hasKeyPair: true,
}

function songDto(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Canción ${i}`,
    artist: 'Aethel Audio',
    duration: 120,
    size: 1024,
    creation_date: '2026-10-01T00:00:00Z',
    file_iv: 'aXY=',
    wrapped_file_key: 'a2V5',
    wrapped_key_iv: 'aXY=',
    is_favorite: false,
    favorited_at: null,
  }
}

const entry = (id: number, song: number) => ({ id, played_at: new Date().toISOString(), song: songDto(song) })

let calls: { url: string; method: string }[] = []
let history = [entry(3, 1), entry(2, 2), entry(1, 1)] // la canción 1 aparece dos veces

function renderPage() {
  const auth: AuthContextValue = {
    session: { status: 'ready', user, masterKey: {} as CryptoKey },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    refreshUser: vi.fn(),
  }
  render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <MemoryRouter initialEntries={['/recientes']}>
          <Routes>
            <Route path="/recientes" element={<RecentPage />} />
          </Routes>
        </MemoryRouter>
      </PlayerProvider>
    </AuthContext.Provider>,
  )
}

describe('RecentPage', () => {
  beforeEach(() => {
    calls = []
    history = [entry(3, 1), entry(2, 2), entry(1, 1)]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        calls.push({ url: input, method })
        if (input.endsWith('/blob')) return new Response('{"code":"blob_missing"}', { status: 404 })
        if (input === '/api/history' && method === 'DELETE') {
          history = []
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify({ count: history.length, next: null, previous: null, results: history }))
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lista cada reproducción, incluidas las repetidas, con su fecha', async () => {
    renderPage()

    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(4) // encabezado + 3 reproducciones
    expect(within(rows[1]).getByText('Canción 1')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Canción 1')).toBeInTheDocument()
    expect(screen.getByText('3 reproducciones')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Reproducido' })).toBeInTheDocument()
    expect(calls[0].url).toMatch(/^\/api\/history\?/)
  })

  it('"Reanudar la última" reproduce la canción más reciente', async () => {
    const u = userEvent.setup()
    renderPage()
    await screen.findAllByText('Canción 1')

    await u.click(screen.getByRole('button', { name: /reanudar la última/i }))

    await waitFor(() => expect(calls.some((c) => c.url === `/api/songs/${songDto(1).id}/blob`)).toBe(true))
  })

  it('borrar historial pide confirmación y deja la lista vacía', async () => {
    const u = userEvent.setup()
    renderPage()
    await screen.findAllByText('Canción 1')

    await u.click(screen.getByRole('button', { name: /borrar historial/i }))
    const dialog = screen.getByRole('dialog', { name: '¿Borrar tu historial?' })
    expect(within(dialog).getByText(/las 3 reproducciones/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await u.click(within(dialog).getByRole('button', { name: 'Borrar historial' }))

    expect(await screen.findByText('Todavía no has reproducido nada')).toBeInTheDocument()
    expect(screen.getByText('Se borró tu historial de reproducción.')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/history' && c.method === 'DELETE')).toBe(true)
  })

  it('sin historial desactiva las acciones', async () => {
    history = []
    renderPage()

    expect(await screen.findByText('Todavía no has reproducido nada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reanudar la última/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /borrar historial/i })).toBeDisabled()
  })
})
