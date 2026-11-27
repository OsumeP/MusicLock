/**
 * Comunidad: seguir al autor de una canción pública. Cubre el cambio optimista y
 * cómo se revierte cuando el servidor rechaza la petición (incluido el límite
 * `follow`, que responde 429).
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { tokenStore } from '../api/tokens'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { generateMasterKey } from '../crypto/keys'
import { PlayerProvider } from '../player/PlayerProvider'
import { CommunityPage } from './CommunityPage'

const ana = { id: 1, email: 'ana@x.com', username: 'ana', hasKeyPair: true } as User

let followStatus: number
let followCalls: string[]

async function setup() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
      if (url.startsWith('/api/community/songs?')) {
        return json({
          count: 1,
          next: null,
          previous: null,
          results: [{
            id: '00000000-0000-4000-8000-000000000001', title: 'Brisa', artist: '', duration: 8, size: 1000,
            published_at: '2026-11-20T00:00:00Z', file_iv: 'aXY=', public_file_key: 'a2V5',
            owner: 'beto', is_mine: false, comment_count: 0, is_following: false,
          }],
        })
      }
      if (url === '/api/community/users/beto/follow') {
        followCalls.push(init?.method ?? 'GET')
        return followStatus === 200
          ? json({ username: 'beto', is_following: init?.method === 'PUT' })
          : json({ detail: 'Request was throttled.' }, followStatus)
      }
      return json({ detail: 'not found' }, 404)
    }),
  )

  const auth = { session: { status: 'ready', user: ana, masterKey: await generateMasterKey() } } as AuthContextValue
  render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <MemoryRouter>
          <CommunityPage scope="community" />
        </MemoryRouter>
      </PlayerProvider>
    </AuthContext.Provider>,
  )
  return (await screen.findByText('Brisa')).closest('tr')!
}

describe('CommunityPage — seguir', () => {
  beforeEach(() => {
    followStatus = 200
    followCalls = []
    tokenStore.set({ access: 'token' })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sigue al autor y la fila queda marcada', async () => {
    const u = userEvent.setup()
    const row = await setup()

    await u.click(within(row).getByRole('button', { name: 'Seguir a beto' }))

    expect(await within(row).findByRole('button', { name: 'Dejar de seguir a beto' })).toHaveAttribute('aria-pressed', 'true')
    expect(followCalls).toEqual(['PUT'])
  })

  it('con 429 (límite del servidor) revierte el cambio y pide esperar', async () => {
    followStatus = 429
    const u = userEvent.setup()
    const row = await setup()

    await u.click(within(row).getByRole('button', { name: 'Seguir a beto' }))

    expect(await screen.findByText(/Demasiados cambios seguidos/)).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Seguir a beto' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('con otro error revierte el cambio con el mensaje genérico', async () => {
    followStatus = 500
    const u = userEvent.setup()
    const row = await setup()

    await u.click(within(row).getByRole('button', { name: 'Seguir a beto' }))

    expect(await screen.findByText('No se pudo seguir a beto.')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Seguir a beto' })).toHaveAttribute('aria-pressed', 'false')
  })
})
