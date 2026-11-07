/**
 * "Compartido conmigo" con criptografía real: Ana cifra y comparte; el navegador
 * de Beto (esta página) abre su privada con SU Master Key, desenvuelve la File Key
 * y descifra el mismo blob. Rol "Consulta": solo reproducir y descargar.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { tokenStore } from '../api/tokens'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { createKeyPair, encryptAudio, wrapFileKeyFor } from '../crypto'
import { generateMasterKey } from '../crypto/keys'
import { PlayerBar } from '../layout/PlayerBar'
import { PlayerProvider } from '../player/PlayerProvider'
import { SharedWithMePage } from './SharedWithMePage'

const SONG_ID = '00000000-0000-4000-8000-000000000001'
const beto = { id: 2, email: 'beto@x.com', username: 'beto', hasKeyPair: true } as User

let calls: string[]
let revoked: boolean
let createdUrls: Blob[]

async function setup() {
  // Lado de Ana: sube y comparte con la clave pública de Beto.
  const anaMaster = await generateMasterKey()
  const original = new Uint8Array(4096).fill(7)
  original.set([0x49, 0x44, 0x33]) // "ID3"
  const encrypted = await encryptAudio(new Blob([original]), anaMaster)
  const betoMaster = await generateMasterKey()
  const betoKeyPair = await createKeyPair(betoMaster)
  const sharedFileKey = await wrapFileKeyFor(encrypted, anaMaster, betoKeyPair.publicKey)
  const ciphertext = await encrypted.ciphertext.arrayBuffer()

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
      if (url.startsWith('/api/shared?')) {
        return json({
          count: revoked ? 0 : 1,
          next: null,
          previous: null,
          results: revoked
            ? []
            : [{
                id: SONG_ID, title: 'Brisa', artist: '', duration: 8, size: ciphertext.byteLength,
                creation_date: '2026-11-07T00:00:00Z', file_iv: encrypted.fileIv, shared_file_key: sharedFileKey,
                owner: 'ana', shared_at: new Date().toISOString(), role: 'query',
              }],
        })
      }
      if (url === `/api/shared/${SONG_ID}/blob`) return revoked ? json({ code: 'not_found' }, 404) : new Response(ciphertext)
      if (url === '/api/me/keypair') {
        return json({ public_key: betoKeyPair.publicKey, wrapped_private_key: betoKeyPair.wrappedPrivateKey, private_key_iv: betoKeyPair.privateKeyIv })
      }
      return json({ detail: 'not found' }, 404)
    }),
  )

  const auth = { session: { status: 'ready', user: beto, masterKey: betoMaster } } as AuthContextValue
  render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <MemoryRouter>
          <SharedWithMePage />
        </MemoryRouter>
        <PlayerBar />
      </PlayerProvider>
    </AuthContext.Provider>,
  )
  return { original }
}

describe('SharedWithMePage', () => {
  beforeEach(() => {
    calls = []
    revoked = false
    createdUrls = []
    tokenStore.set({ access: 'token' })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      createdUrls.push(blob as Blob)
      return `blob:test/${createdUrls.length}`
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'))
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lista la canción con su propietario y solo permite reproducir y descargar', async () => {
    await setup()

    const row = (await screen.findByText('Brisa')).closest('tr')!
    expect(within(row).getByText('de ana')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Reproducir Brisa' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Descargar Brisa' })).toBeInTheDocument()
    for (const name of [/favoritos/, /playlist/, /^Compartir/, /^Editar/, /^Eliminar/]) {
      expect(within(row).queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('Beto reproduce: el <audio> recibe el MP3 original de Ana y no se registra en su historial', async () => {
    const u = userEvent.setup()
    const { original } = await setup()

    await u.click(await screen.findByRole('button', { name: 'Reproducir Brisa' }))

    await waitFor(() => expect(createdUrls).toHaveLength(1), { timeout: 10_000 })
    expect(new Uint8Array(await createdUrls[0].arrayBuffer())).toEqual(original)
    expect(calls).toContain(`/api/shared/${SONG_ID}/blob`)
    expect(calls).toContain('/api/me/keypair')
    expect(calls.some((c) => c.endsWith('/plays'))).toBe(false)
    expect(calls.some((c) => c.startsWith('/api/songs/'))).toBe(false) // nunca usa el Proxy del propietario
  })

  it('si Ana revocó, al reproducir se explica que ya no hay acceso', async () => {
    const u = userEvent.setup()
    await setup()
    const play = await screen.findByRole('button', { name: 'Reproducir Brisa' })
    revoked = true

    await u.click(play)

    const bar = screen.getByRole('contentinfo', { name: 'Reproductor' })
    expect(await within(bar).findByText('La canción ya no existe o ya no tienes acceso.')).toBeInTheDocument()
    expect(createdUrls).toHaveLength(0)
  })
})
