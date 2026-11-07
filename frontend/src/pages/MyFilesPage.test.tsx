import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { MyFilesPage } from './MyFilesPage'

const user: User = {
  id: 1,
  email: 'ana@example.com',
  username: 'ana',
  plan: { code: 'free', name: 'Free', maxStorageBytes: 500 * 1024 * 1024, maxFileSizeBytes: 20 * 1024 * 1024 },
  usedStorage: 0,
  storageAvailable: 500 * 1024 * 1024,
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
let respond: (url: URL) => Response

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
    refreshUser: vi.fn(),
  }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/archivos" element={<><MyFilesPage /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('MyFilesPage', () => {
  beforeEach(() => {
    calls = []
    respond = () => new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        calls.push(input)
        return respond(new URL(input, 'http://localhost'))
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
