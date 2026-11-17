import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { PlayerProvider } from '../player/PlayerProvider'
import { MyFilesPage } from './MyFilesPage'
import { PlaylistDetailPage } from './PlaylistDetailPage'
import { PlaylistsPage } from './PlaylistsPage'

const user: User = {
  id: 1,
  email: 'ana@example.com',
  username: 'ana',
  plan: { code: 'free', name: 'Free', maxStorageBytes: 500 * 1024 * 1024, maxFileSizeBytes: 20 * 1024 * 1024 },
  usedStorage: 0,
  storageAvailable: 500 * 1024 * 1024,
  hasKeyPair: true,
}

const songId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const PL1 = '11111111-1111-4111-8111-111111111111'
const PL2 = '22222222-2222-4222-8222-222222222222'

function songDto(i: number) {
  return {
    id: songId(i),
    title: `Canción ${i}`,
    artist: '',
    duration: 60,
    size: 1024,
    creation_date: '2026-10-01T00:00:00Z',
    file_iv: 'aXY=',
    wrapped_file_key: 'a2V5',
    wrapped_key_iv: 'aXY=',
    is_favorite: false,
    favorited_at: null,
  }
}

/** "Servidor" en memoria con playlists de Ana. */
let playlists: Record<string, { name: string; description: string; songs: number[] }>
let calls: { url: string; method: string; body: unknown }[]

function summary(id: string, song?: string) {
  const p = playlists[id]
  return {
    id,
    name: p.name,
    description: p.description,
    song_count: p.songs.length,
    total_size: p.songs.length * 1024,
    total_duration: p.songs.length * 60,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    ...(song && { contains_song: p.songs.some((i) => songId(i) === song) }),
  }
}

function server(url: URL, method: string, body: Record<string, unknown> | null): Response {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
  const parts = url.pathname.split('/') // ['', 'api', 'playlists', id, 'songs', songId]
  if (url.pathname === '/api/songs') return json({ count: 2, next: null, previous: null, results: [songDto(1), songDto(2)] })
  if (url.pathname.endsWith('/blob')) return new Response('{"code":"blob_missing"}', { status: 404 })
  if (url.pathname === '/api/playlists') {
    if (method === 'POST') {
      const id = '33333333-3333-4333-8333-333333333333'
      playlists[id] = { name: String(body?.name), description: String(body?.description ?? ''), songs: [] }
      return json(summary(id), 201)
    }
    return json(Object.keys(playlists).map((id) => summary(id, url.searchParams.get('song') ?? undefined)))
  }
  const id = parts[3]
  const playlist = playlists[id]
  if (!playlist) return json({ code: 'not_found' }, 404)
  if (parts[4] === 'songs') {
    const song = Number(parts[5].slice(-12))
    if (method === 'PUT') {
      if (!playlist.songs.includes(song)) playlist.songs.push(song)
      return json(summary(id), 201)
    }
    if (method === 'DELETE') {
      playlist.songs = playlist.songs.filter((s) => s !== song)
      return new Response(null, { status: 204 })
    }
    if (method === 'PATCH') {
      playlist.songs = playlist.songs.filter((s) => s !== song)
      playlist.songs.splice(Number(body?.position), 0, song)
    }
  }
  if (method === 'DELETE') {
    delete playlists[id]
    return new Response(null, { status: 204 })
  }
  if (method === 'PATCH' && parts[4] !== 'songs') Object.assign(playlist, body)
  return json({ ...summary(id), songs: playlist.songs.map(songDto) })
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderAt(path: string) {
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
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/archivos" element={<MyFilesPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </PlayerProvider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  calls = []
  playlists = {
    [PL1]: { name: 'Para correr', description: 'Rápidas', songs: [1, 2] },
    [PL2]: { name: 'Vacía', description: '', songs: [] },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body as string) : null
      calls.push({ url: input, method, body })
      return server(new URL(input, 'http://localhost'), method, body)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('PlaylistsPage', () => {
  it('muestra una tarjeta por playlist con sus totales y enlace al detalle', async () => {
    renderAt('/playlists')

    const link = await screen.findByRole('link', { name: 'Para correr' })
    expect(link).toHaveAttribute('href', `/playlists/${PL1}`)
    const card = link.closest('li')!
    expect(within(card).getByText(/2 pistas · 2\.0 KB · 2:00/)).toBeInTheDocument()
    expect(within(card).getByText('Rápidas')).toBeInTheDocument()
    expect(screen.getByText('2 playlists')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reproducir Vacía' })).toBeDisabled()
  })

  it('▶ en una tarjeta carga la playlist y reproduce su primera canción', async () => {
    const u = userEvent.setup()
    renderAt('/playlists')

    await u.click(await screen.findByRole('button', { name: 'Reproducir Para correr' }))

    await waitFor(() => expect(calls.some((c) => c.url === `/api/songs/${songId(1)}/blob`)).toBe(true))
  })

  it('crear una playlist lleva a su detalle', async () => {
    const u = userEvent.setup()
    renderAt('/playlists')
    await screen.findByText('Para correr')

    await u.click(screen.getByRole('button', { name: /nueva playlist/i }))
    const dialog = screen.getByRole('dialog', { name: 'Nueva playlist' })
    await u.type(within(dialog).getByLabelText('Nombre'), '  Noche  ')
    await u.click(within(dialog).getByRole('button', { name: /crear playlist/i }))

    expect(await screen.findByRole('heading', { name: 'Noche' })).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Noche', description: '' })
    expect(screen.getByTestId('location')).toHaveTextContent('/playlists/33333333')
  })
})

describe('PlaylistDetailPage', () => {
  const titles = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getByText(/^Canción \d$/).textContent)

  it('lista las canciones en orden, sin el botón de eliminar de la bóveda', async () => {
    renderAt(`/playlists/${PL1}`)

    expect(await screen.findByRole('heading', { name: 'Para correr' })).toBeInTheDocument()
    expect(titles()).toEqual(['Canción 1', 'Canción 2'])
    expect(screen.queryByRole('button', { name: 'Eliminar Canción 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir Canción 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bajar Canción 2' })).toBeDisabled()
  })

  it('"Aleatorio" reproduce la playlist empezando por una canción al azar', async () => {
    const u = userEvent.setup()
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // el azar elige la última
    renderAt(`/playlists/${PL1}`)

    await u.click(await screen.findByRole('button', { name: /aleatorio/i }))

    await waitFor(() => expect(calls.some((c) => c.url === `/api/songs/${songId(2)}/blob`)).toBe(true))
    expect(calls.some((c) => c.url === `/api/songs/${songId(1)}/blob`)).toBe(false)
    vi.mocked(Math.random).mockRestore()
  })

  it('bajar una canción la mueve y envía la nueva posición', async () => {
    const u = userEvent.setup()
    renderAt(`/playlists/${PL1}`)
    await screen.findByRole('heading', { name: 'Para correr' })

    await u.click(screen.getByRole('button', { name: 'Bajar Canción 1' }))

    await waitFor(() => expect(titles()).toEqual(['Canción 2', 'Canción 1']))
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: `/api/playlists/${PL1}/songs/${songId(1)}`, body: { position: 1 } })
  })

  it('quitar una canción la saca de la playlist sin borrarla de la bóveda', async () => {
    const u = userEvent.setup()
    renderAt(`/playlists/${PL1}`)
    await screen.findByRole('heading', { name: 'Para correr' })

    await u.click(screen.getByRole('button', { name: 'Quitar Canción 1 de la playlist' }))

    await waitFor(() => expect(titles()).toEqual(['Canción 2']))
    expect(screen.getByText(/sigue en tu bóveda/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE' && c.url.startsWith('/api/songs/'))).toBe(false)
  })

  it('renombrar actualiza el encabezado', async () => {
    const u = userEvent.setup()
    renderAt(`/playlists/${PL1}`)
    await screen.findByRole('heading', { name: 'Para correr' })

    await u.click(screen.getByRole('button', { name: 'Editar' }))
    const name = within(screen.getByRole('dialog', { name: 'Editar playlist' })).getByLabelText('Nombre')
    await u.clear(name)
    await u.type(name, 'Entreno')
    await u.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('heading', { name: 'Entreno' })).toBeInTheDocument()
  })

  it('borrar pide confirmación y vuelve a la lista de playlists', async () => {
    const u = userEvent.setup()
    renderAt(`/playlists/${PL1}`)
    await screen.findByRole('heading', { name: 'Para correr' })

    await u.click(screen.getByRole('button', { name: 'Borrar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Borrar “Para correr”?' })
    expect(within(dialog).getByText(/no se elimina ningún archivo/)).toBeInTheDocument()
    await u.click(within(dialog).getByRole('button', { name: 'Borrar playlist' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/playlists$/))
    expect(playlists[PL1]).toBeUndefined()
  })

  it('una playlist inexistente o ajena muestra "no encontrada"', async () => {
    renderAt('/playlists/99999999-9999-4999-8999-999999999999')
    expect(await screen.findByRole('heading', { name: 'Playlist no encontrada' })).toBeInTheDocument()
  })
})

describe('Añadir a playlist (desde Mis Archivos)', () => {
  it('marca las playlists que ya contienen la canción y añade con la casilla', async () => {
    const u = userEvent.setup()
    renderAt('/archivos')

    await u.click(await screen.findByRole('button', { name: 'Añadir Canción 1 a una playlist' }))
    const dialog = screen.getByRole('dialog', { name: 'Añadir a playlist' })
    const correr = await within(dialog).findByRole('checkbox', { name: /Para correr/ })
    const vacia = within(dialog).getByRole('checkbox', { name: /Vacía/ })
    expect(correr).toBeChecked()
    expect(vacia).not.toBeChecked()
    expect(calls.some((c) => c.url === `/api/playlists?song=${songId(1)}`)).toBe(true)

    await u.click(vacia)

    await waitFor(() => expect(playlists[PL2].songs).toEqual([1]))
    expect(vacia).toBeChecked()
  })

  it('"Crear y añadir" crea la playlist con la canción dentro', async () => {
    const u = userEvent.setup()
    renderAt('/archivos')

    await u.click(await screen.findByRole('button', { name: 'Añadir Canción 2 a una playlist' }))
    const dialog = screen.getByRole('dialog', { name: 'Añadir a playlist' })
    await within(dialog).findByRole('checkbox', { name: /Para correr/ })
    await u.type(within(dialog).getByLabelText('Nombre de la playlist nueva'), 'Noche')
    await u.click(within(dialog).getByRole('button', { name: /crear y añadir/i }))

    expect(await within(dialog).findByRole('checkbox', { name: /Noche/ })).toBeChecked()
    expect(Object.values(playlists).find((p) => p.name === 'Noche')?.songs).toEqual([2])
  })
})
