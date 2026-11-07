import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { PlayerProvider } from '../player/PlayerProvider'
import { FavoritesPage } from './FavoritesPage'

const user: User = {
  id: 1,
  email: 'ana@example.com',
  username: 'ana',
  plan: { code: 'free', name: 'Free', maxStorageBytes: 500 * 1024 * 1024, maxFileSizeBytes: 20 * 1024 * 1024 },
  usedStorage: 0,
  storageAvailable: 500 * 1024 * 1024,
}

function favoriteDto(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Favorita ${i}`,
    artist: 'Aethel Audio',
    duration: 120,
    size: 1024,
    creation_date: new Date().toISOString(),
    file_iv: 'aXY=',
    wrapped_file_key: 'a2V5',
    wrapped_key_iv: 'aXY=',
    is_favorite: true,
    favorited_at: new Date().toISOString(),
  }
}

let calls: { url: string; method: string }[] = []
let favorites = [favoriteDto(1), favoriteDto(2)]

function renderPage(path = '/favoritos') {
  const auth: AuthContextValue = {
    session: { status: 'ready', user, masterKey: {} as CryptoKey },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }
  render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/favoritos" element={<FavoritesPage />} />
          </Routes>
        </MemoryRouter>
      </PlayerProvider>
    </AuthContext.Provider>,
  )
}

describe('FavoritesPage', () => {
  beforeEach(() => {
    calls = []
    favorites = [favoriteDto(1), favoriteDto(2)]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        calls.push({ url: input, method })
        const url = new URL(input, 'http://localhost')
        if (url.pathname.endsWith('/blob')) return new Response('{"code":"blob_missing"}', { status: 404 })
        if (method === 'DELETE' && url.pathname.endsWith('/favorite')) {
          const id = url.pathname.split('/')[3]
          const song = favorites.find((s) => s.id === id)!
          favorites = favorites.filter((s) => s.id !== id)
          return new Response(JSON.stringify({ ...song, is_favorite: false, favorited_at: null }))
        }
        return new Response(JSON.stringify({ count: favorites.length, next: null, previous: null, results: favorites }))
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('pide solo las favoritas y muestra cuántas hay', async () => {
    renderPage()

    expect(await screen.findByText('Favorita 1')).toBeInTheDocument()
    expect(screen.getByText('2 pistas guardadas')).toBeInTheDocument()
    expect(new URL(calls[0].url, 'http://x').searchParams.get('favorites')).toBe('1')
    expect(screen.getByRole('columnheader', { name: 'Marcado' })).toBeInTheDocument()
  })

  it('pasa la búsqueda de la URL junto con el filtro de favoritos', async () => {
    renderPage('/favoritos?q=aethel')
    await screen.findByText('Favorita 1')
    const params = new URL(calls[0].url, 'http://x').searchParams
    expect([params.get('favorites'), params.get('q')]).toEqual(['1', 'aethel'])
  })

  it('al quitar un favorito la canción sale de la lista', async () => {
    const u = userEvent.setup()
    renderPage()

    await u.click(await screen.findByRole('button', { name: 'Quitar Favorita 1 de favoritos' }))

    await waitFor(() => expect(screen.queryByText('Favorita 1')).not.toBeInTheDocument())
    expect(screen.getByText('1 pista guardada')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/favorite'))).toBe(true)
  })

  it('"Reproducir todo" empieza por la primera favorita', async () => {
    const u = userEvent.setup()
    renderPage()
    await screen.findByText('Favorita 1')

    await u.click(screen.getByRole('button', { name: /reproducir todo/i }))

    await waitFor(() => expect(calls.some((c) => c.url === `/api/songs/${favoriteDto(1).id}/blob`)).toBe(true))
    expect(within(screen.getByRole('row', { current: true })).getByText('Favorita 1')).toBeInTheDocument()
  })

  it('sin favoritos muestra cómo marcarlos y desactiva "Reproducir todo"', async () => {
    favorites = []
    renderPage()

    expect(await screen.findByText('Aún no tienes favoritos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Mis Archivos' })).toHaveAttribute('href', '/archivos')
    expect(screen.getByRole('button', { name: /reproducir todo/i })).toBeDisabled()
  })
})
