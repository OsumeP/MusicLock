/**
 * Modal "Compartir" con criptografía real: lo que llega al servidor falso es la
 * File Key envuelta para Beto, y Beto (con su privada) descifra la canción de Ana.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { toSong, type Song } from '../api/songs'
import { tokenStore } from '../api/tokens'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { createKeyPair, decryptSharedAudio, encryptAudio, publicKeyFingerprint, unlockPrivateKey, type KeyPairRegistration } from '../crypto'
import { generateMasterKey } from '../crypto/keys'
import { ShareSongModal } from './ShareSongModal'

const ana = { id: 1, email: 'ana@x.com', username: 'ana', hasKeyPair: true } as User

interface Call {
  url: string
  method: string
  body: unknown
}

let calls: Call[]
let shares: { recipient: string; role: string; created_at: string }[]
let beto: { masterKey: CryptoKey; keyPair: KeyPairRegistration }

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status })

function fakeServer(url: string, method: string): Response {
  const path = url.split('?')[0]
  if (path === '/api/users/lookup') {
    const q = new URL(url, 'http://x').searchParams.get('q')
    if (q === 'beto' || q === 'beto@x.com') return json({ username: 'beto', public_key: beto.keyPair.publicKey })
    if (q === 'ana') return json({ detail: 'x', code: 'self_share' }, 400)
    if (q === 'nueva') return json({ detail: 'x', code: 'recipient_without_key' }, 409)
    return json({ detail: 'x', code: 'recipient_not_found' }, 404)
  }
  if (path.endsWith('/shares')) return json(shares)
  const share = path.match(/\/shares\/(.+)$/)
  if (share && method === 'PUT') {
    const created = { recipient: decodeURIComponent(share[1]), role: 'query', created_at: new Date().toISOString() }
    shares = [created, ...shares.filter((s) => s.recipient !== created.recipient)]
    return json(created, 201)
  }
  if (share && method === 'DELETE') {
    shares = shares.filter((s) => s.recipient !== decodeURIComponent(share[1]))
    return json(null, 204)
  }
  return json({ detail: 'not found' }, 404)
}

async function setup(initialShares: typeof shares = []) {
  const masterKey = await generateMasterKey()
  const original = new Uint8Array(2048).fill(9)
  const encrypted = await encryptAudio(new Blob([original]), masterKey)
  const song: Song = toSong({
    id: 'song-1',
    title: 'Aurora',
    artist: '',
    duration: 8,
    size: encrypted.ciphertext.size,
    creation_date: '2026-11-07T00:00:00Z',
    file_iv: encrypted.fileIv,
    wrapped_file_key: encrypted.wrappedFileKey,
    wrapped_key_iv: encrypted.wrappedKeyIv,
  })
  shares = initialShares
  const onClose = vi.fn()
  const auth = { session: { status: 'ready', user: ana, masterKey } } as AuthContextValue
  render(
    <AuthContext.Provider value={auth}>
      <ShareSongModal song={song} onClose={onClose} />
    </AuthContext.Provider>,
  )
  return { song, encrypted, original, onClose }
}

describe('ShareSongModal', () => {
  beforeEach(async () => {
    calls = []
    tokenStore.set({ access: 'token' })
    const masterKey = await generateMasterKey()
    beto = { masterKey, keyPair: await createKeyPair(masterKey) }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        const body = init?.body ? JSON.parse(init.body as string) : null
        calls.push({ url, method, body })
        return fakeServer(url, method)
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('busca a Beto, muestra su huella y comparte: Beto descifra la canción con su clave privada', async () => {
    const u = userEvent.setup()
    const { encrypted, original } = await setup()
    expect(await screen.findByText('Solo tú.')).toBeInTheDocument()

    await u.type(screen.getByLabelText('Correo o usuario con quien compartir'), 'beto')
    await u.click(screen.getByRole('button', { name: /buscar/i }))
    const card = await screen.findByLabelText('Destinatario beto')
    expect(within(card).getByText(await publicKeyFingerprint(beto.keyPair.publicKey))).toBeInTheDocument()

    await u.click(within(card).getByRole('button', { name: 'Compartir con beto' }))

    expect(await screen.findByText('“Aurora” se compartió con beto.', {}, { timeout: 10_000 })).toBeInTheDocument()
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.url).toBe('/api/songs/song-1/shares/beto')
    const { wrapped_file_key } = put.body as { wrapped_file_key: string }
    // Del lado de Beto: su privada (envuelta con SU Master Key) abre la File Key y descifra el mismo blob.
    const betoPrivate = await unlockPrivateKey(beto.keyPair.wrappedPrivateKey, beto.keyPair.privateKeyIv, beto.masterKey)
    const played = await decryptSharedAudio(encrypted.ciphertext, { fileIv: encrypted.fileIv, sharedFileKey: wrapped_file_key }, betoPrivate)
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(original)
    // Nada de la Master Key ni de la File Key de Ana viaja en claro.
    expect(JSON.stringify(put.body)).not.toContain(encrypted.wrappedFileKey)
    // Aparece en "Con acceso".
    expect(within(screen.getByRole('list', { name: 'Personas con acceso' })).getByText('beto')).toBeInTheDocument()
  }, 30_000)

  it('muestra errores claros de búsqueda y no comparte', async () => {
    const u = userEvent.setup()
    await setup()
    const input = await screen.findByLabelText('Correo o usuario con quien compartir')
    const cases: [string, string][] = [
      ['nadie', 'No hay ninguna cuenta con ese correo o usuario.'],
      ['ana', 'No puedes compartir contigo.'],
      ['nueva', 'Esa persona aún no tiene clave para compartir: debe iniciar sesión en MusicLock una vez.'],
    ]
    for (const [query, message] of cases) {
      await u.clear(input)
      await u.type(input, query)
      await u.click(screen.getByRole('button', { name: /buscar/i }))
      expect(await screen.findByText(message)).toBeInTheDocument()
    }
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  }, 15_000)

  it('lista quién tiene acceso y revoca', async () => {
    const u = userEvent.setup()
    await setup([
      { recipient: 'carla', role: 'query', created_at: '2026-11-07T00:00:00Z' },
      { recipient: 'beto', role: 'query', created_at: '2026-11-06T00:00:00Z' },
    ])
    const list = await screen.findByRole('list', { name: 'Personas con acceso' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('carla'),
      expect.stringContaining('beto'),
    ])

    await u.click(screen.getByRole('button', { name: 'Revocar el acceso de beto' }))

    expect(await screen.findByText('beto ya no tiene acceso a “Aurora”.')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/api/songs/song-1/shares/beto')
    await waitFor(() => expect(within(list).queryByText('beto')).not.toBeInTheDocument())
    expect(within(list).getByText('carla')).toBeInTheDocument()
  })
})
