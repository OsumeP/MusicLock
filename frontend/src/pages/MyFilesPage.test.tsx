import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { PlayerProvider } from '../player/PlayerProvider'
import { MyFilesPage } from './MyFilesPage'

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
    artist: i % 2 ? 'Aethel Audio' : '',
    duration: 258,
    size: 4 * 1024 * 1024,
    creation_date: new Date().toISOString(),
    file_iv: 'aXY=',
    wrapped_file_key: 'a2V5',
    wrapped_key_iv: 'aXY=',
  }
}

let calls: string[] = []
let respond: (url: URL, init?: RequestInit) => Response
let requests: { url: string; method: string; body: unknown }[] = []

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

async function renderPage(path = '/archivos') {
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
            <Route path="/archivos" element={<><MyFilesPage /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </PlayerProvider>
    </AuthContext.Provider>,
  )
  return auth
}

describe('MyFilesPage', () => {
  beforeEach(() => {
    calls = []
    requests = []
    respond = () => new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        calls.push(input)
        requests.push({ url: input, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null })
        return respond(new URL(input, 'http://localhost'), init)
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lista las canciones con sus metadatos y el distintivo de cifrado', async () => {
    respond = () => new Response(JSON.stringify({ count: 2, next: null, previous: null, results: [songDto(1), songDto(2)] }))

    await renderPage()

    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(3) // encabezado + 2
    const first = within(rows[1])
    expect(first.getByText('Canción 1')).toBeInTheDocument()
    expect(first.getByText('Aethel Audio')).toBeInTheDocument()
    expect(first.getByText('4:18')).toBeInTheDocument()
    expect(first.getByText('4.0 MB')).toBeInTheDocument()
    expect(first.getByText('AES-GCM 256')).toBeInTheDocument()
    expect(screen.getByText('2 elementos')).toBeInTheDocument()
    expect(screen.getByText(/Mostrando 1–2 de 2/)).toBeInTheDocument()
  })

  it('muestra el estado vacío con un botón para subir', async () => {
    await renderPage()
    expect(await screen.findByText('Tu bóveda está vacía')).toBeInTheDocument()
  })

  it('envía la búsqueda de la URL a la API y ofrece limpiarla', async () => {
    await renderPage('/archivos?q=chopin')

    expect(await screen.findByText(/Sin resultados para “chopin”/)).toBeInTheDocument()
    expect(new URL(calls[0], 'http://x').searchParams.get('q')).toBe('chopin')
  })

  it('pagina con Anterior / Siguiente', async () => {
    respond = (url) => {
      const page = Number(url.searchParams.get('page'))
      const results = page === 1 ? Array.from({ length: 20 }, (_, i) => songDto(i + 1)) : [songDto(21)]
      return new Response(JSON.stringify({ count: 21, next: page === 1 ? 'next' : null, previous: page === 2 ? 'prev' : null, results }))
    }
    const u = userEvent.setup()
    await renderPage()
    await screen.findByText('Canción 1')

    await u.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('Canción 21')).toBeInTheDocument()
    expect(screen.getByText(/Mostrando 21–21 de 21/)).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/archivos?page=2')
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('si la carga falla muestra un error y permite reintentar', async () => {
    respond = () => new Response('{}', { status: 500 })
    const u = userEvent.setup()
    await renderPage()

    expect(await screen.findByText(/No se pudo cargar tu bóveda/)).toBeInTheDocument()

    respond = () => new Response(JSON.stringify({ count: 1, next: null, previous: null, results: [songDto(1)] }))
    await u.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Canción 1')).toBeInTheDocument()
    expect(screen.queryByText(/No se pudo cargar/)).not.toBeInTheDocument()
  })

  it('el botón ▶ de una fila pide el blob cifrado de esa canción al reproductor', async () => {
    respond = (url) =>
      url.pathname.endsWith('/blob')
        ? new Response('{"detail":"x","code":"blob_missing"}', { status: 404 })
        : new Response(JSON.stringify({ count: 2, next: null, previous: null, results: [songDto(1), songDto(2)] }))
    const u = userEvent.setup()
    await renderPage()

    await u.click(await screen.findByRole('button', { name: 'Reproducir Canción 2' }))

    await waitFor(() => expect(calls).toContain(`/api/songs/${songDto(2).id}/blob`))
    expect(screen.getByRole('row', { current: true })).toHaveTextContent('Canción 2')
  })

  /** Servidor con dos canciones que acepta PATCH y DELETE. */
  function crudServer() {
    let songs = [songDto(1), songDto(2)]
    respond = (url, init) => {
      const id = url.pathname.split('/')[3]
      if (init?.method === 'PATCH') {
        const changes = JSON.parse(init.body as string)
        songs = songs.map((s) => (s.id === id ? { ...s, ...changes } : s))
        return new Response(JSON.stringify(songs.find((s) => s.id === id)))
      }
      if (init?.method === 'DELETE') {
        songs = songs.filter((s) => s.id !== id)
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ count: songs.length, next: null, previous: null, results: songs }))
    }
  }

  it('edita el título y el artista de una canción', async () => {
    crudServer()
    const u = userEvent.setup()
    await renderPage()

    await u.click(await screen.findByRole('button', { name: 'Editar Canción 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar canción' })
    const title = within(dialog).getByLabelText('Título')
    await u.clear(title)
    await u.type(title, 'Starlight Odyssey')
    await u.click(within(dialog).getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByText('Starlight Odyssey')).toBeInTheDocument()
    expect(requests.find((r) => r.method === 'PATCH')).toEqual({
      url: `/api/songs/${songDto(1).id}`,
      method: 'PATCH',
      body: { title: 'Starlight Odyssey', artist: 'Aethel Audio' },
    })
    expect(screen.getByText(/Se guardaron los cambios/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('eliminar pide confirmación; "Cancelar" (con el foco por defecto) no borra nada', async () => {
    crudServer()
    const u = userEvent.setup()
    await renderPage()

    await u.click(await screen.findByRole('button', { name: 'Eliminar Canción 2' }))
    const dialog = screen.getByRole('dialog', { name: /¿Eliminar “Canción 2”\?/ })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await u.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(requests.some((r) => r.method === 'DELETE')).toBe(false)
    expect(screen.getByText('Canción 2')).toBeInTheDocument()
  })

  it('al confirmar elimina la canción, recarga la lista y actualiza la cuota', async () => {
    crudServer()
    const u = userEvent.setup()
    const auth = await renderPage()

    await u.click(await screen.findByRole('button', { name: 'Eliminar Canción 2' }))
    await u.click(screen.getByRole('button', { name: /eliminar definitivamente/i }))

    await waitFor(() => expect(screen.queryByText('Canción 2')).not.toBeInTheDocument())
    expect(requests.find((r) => r.method === 'DELETE')?.url).toBe(`/api/songs/${songDto(2).id}`)
    expect(auth.refreshUser).toHaveBeenCalled()
    expect(screen.getByText(/se eliminó y se liberó su espacio/)).toBeInTheDocument()
    expect(screen.getByText('1 elemento')).toBeInTheDocument()
  })

  it('el corazón marca la canción como favorita con PUT y queda pulsado', async () => {
    respond = (_url, init) =>
      init?.method === 'PUT'
        ? new Response(JSON.stringify({ ...songDto(1), is_favorite: true, favorited_at: new Date().toISOString() }))
        : new Response(JSON.stringify({ count: 1, next: null, previous: null, results: [songDto(1)] }))
    const u = userEvent.setup()
    await renderPage()

    await u.click(await screen.findByRole('button', { name: 'Añadir Canción 1 a favoritos' }))

    const heart = await screen.findByRole('button', { name: 'Quitar Canción 1 de favoritos' })
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    expect(requests.find((r) => r.method === 'PUT')?.url).toBe(`/api/songs/${songDto(1).id}/favorite`)
  })

  it('si falla el favorito, revierte el corazón y muestra un aviso', async () => {
    respond = (_url, init) =>
      init?.method === 'DELETE'
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify({ count: 1, next: null, previous: null, results: [{ ...songDto(1), is_favorite: true }] }))
    const u = userEvent.setup()
    await renderPage()

    await u.click(await screen.findByRole('button', { name: 'Quitar Canción 1 de favoritos' }))

    expect(await screen.findByText(/No se pudo quitar “Canción 1” de favoritos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar Canción 1 de favoritos' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('abre el modal de subida y lo cierra con Escape', async () => {
    const u = userEvent.setup()
    await renderPage()
    await screen.findByText('Tu bóveda está vacía')

    await u.click(screen.getAllByRole('button', { name: /subir archivo cifrado/i })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Subir archivo cifrado' })
    expect(within(dialog).getByLabelText('Archivo MP3')).toBeInTheDocument()

    await u.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
