import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { AuthContext, type AuthContextValue, type Session } from '../auth/session'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { LandingPage } from './LandingPage'
import { NotFoundPage } from './NotFoundPage'

const user = { id: 1, email: 'a@x.com', username: 'ana' } as User

function renderWithSession(ui: React.ReactNode, session: Session, path = '/') {
  const auth = { session, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() } as AuthContextValue
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('LandingPage', () => {
  it('para visitantes ofrece registrarse e iniciar sesión', () => {
    renderWithSession(<LandingPage />, { status: 'anonymous' })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu música, tus archivos, 100 % tuyos.')
    const signups = screen.getAllByRole('link', { name: 'Comenzar gratis' }) // encabezado + tarjeta del plan Free
    signups.forEach((link) => expect(link).toHaveAttribute('href', '/registro'))
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Ir a mi bóveda' })).not.toBeInTheDocument()
  })

  it('con sesión iniciada lleva directo a la bóveda', () => {
    renderWithSession(<LandingPage />, { status: 'ready', user, masterKey: {} as CryptoKey })

    expect(screen.getAllByRole('link', { name: 'Ir a mi bóveda' })[0]).toHaveAttribute('href', '/inicio')
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument()
  })

  it('describe solo lo que hace el MVP: MP3, sin recuperación de contraseña, Premium próximamente', () => {
    renderWithSession(<LandingPage />, { status: 'anonymous' })

    expect(screen.getByText(/Por ahora, archivos MP3/)).toBeInTheDocument()
    expect(screen.getByText(/si la olvidas, tus archivos no se pueden recuperar/)).toBeInTheDocument()
    expect(screen.getByText('Disponible próximamente')).toBeInTheDocument()
    expect(screen.queryByText(/FLAC|WAV/)).not.toBeInTheDocument()
  })
})

describe('NotFoundPage', () => {
  it('se muestra en rutas desconocidas con un enlace al inicio', () => {
    renderWithSession(
      <Routes>
        <Route path="/" element={<p>landing</p>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>,
      { status: 'anonymous' },
      '/no-existe',
    )
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })
})

describe('ErrorBoundary', () => {
  it('muestra un mensaje amable si un componente falla al renderizar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken(): never {
      throw new Error('fallo de prueba')
    }

    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal')
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
