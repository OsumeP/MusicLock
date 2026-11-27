/**
 * Publicar y despublicar con criptografía real y un servidor falso (fetch para
 * descargar y listar accesos, XMLHttpRequest para la subida). Se comprueba QUÉ
 * sale del navegador al despublicar: el mismo audio con una File Key nueva.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Song } from '../api/songs'
import { tokenStore } from '../api/tokens'
import {
  createKeyPair,
  decryptAudio,
  decryptPublicAudio,
  decryptSharedAudio,
  encryptAudio,
  exportFileKeyForPublishing,
  unlockPrivateKey,
  type KeyPairRegistration,
} from '../crypto'
import { generateMasterKey } from '../crypto/keys'
import { publishOwnSong, unpublishOwnSong, type UnpublishStep } from './publishing'

const SONG_ID = '00000000-0000-4000-8000-000000000001'

let uploads: FormData[]
/** Respuestas de la subida, en orden; la última se repite. */
let uploadResponses: { status: number; body: unknown }[]
/** Accesos que devuelve el servidor en cada consulta, en orden; el último se repite. */
let sharesResponses: { recipient: string; recipient_public_key: string; role: string; created_at: string }[][]
let sharesCalls: number
let fetchCalls: { url: string; init?: RequestInit }[]

class FakeXHR {
  status = 0
  responseText = ''
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  open() {}
  setRequestHeader() {}
  abort() {
    this.onabort?.()
  }
  send(form: FormData) {
    uploads.push(form)
    const response = uploadResponses[Math.min(uploads.length - 1, uploadResponses.length - 1)]
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 })
      this.status = response.status
      this.responseText = JSON.stringify(response.body)
      this.onload?.()
    })
  }
}

function songFrom(encrypted: Awaited<ReturnType<typeof encryptAudio>>, visibility: 'public' | 'private'): Song {
  return {
    id: SONG_ID, title: 'Starlight', artist: '', duration: 10, size: encrypted.ciphertext.size, createdAt: '2026-11-20T00:00:00Z',
    fileIv: encrypted.fileIv, wrappedFileKey: encrypted.wrappedFileKey, wrappedKeyIv: encrypted.wrappedKeyIv,
    isFavorite: false, favoritedAt: null, visibility, publishedAt: visibility === 'public' ? '2026-11-20T00:00:00Z' : null,
  }
}

function okBody(form: FormData) {
  return {
    id: SONG_ID, title: 'Starlight', artist: '', duration: 10, size: (form.get('file') as File).size,
    creation_date: '2026-11-20T00:00:00Z', file_iv: form.get('file_iv'), wrapped_file_key: form.get('wrapped_file_key'),
    wrapped_key_iv: form.get('wrapped_key_iv'), visibility: 'private', published_at: null,
  }
}

async function setup() {
  const masterKey = await generateMasterKey()
  const audio = crypto.getRandomValues(new Uint8Array(4096))
  const encrypted = await encryptAudio(new Blob([audio]), masterKey)
  const ciphertext = await encrypted.ciphertext.arrayBuffer()
  const publicFileKey = await exportFileKeyForPublishing(encrypted, masterKey)

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init })
      if (url === `/api/songs/${SONG_ID}/blob`) return new Response(ciphertext)
      if (url === `/api/songs/${SONG_ID}/shares`) {
        const shares = sharesResponses[Math.min(sharesCalls, sharesResponses.length - 1)]
        sharesCalls++
        return new Response(JSON.stringify(shares))
      }
      if (url === `/api/songs/${SONG_ID}/publish`) {
        return new Response(
          JSON.stringify({
            id: SONG_ID, title: 'Starlight', artist: '', duration: 10, size: ciphertext.byteLength,
            creation_date: '2026-11-20T00:00:00Z', file_iv: encrypted.fileIv, wrapped_file_key: encrypted.wrappedFileKey,
            wrapped_key_iv: encrypted.wrappedKeyIv, visibility: 'public', published_at: '2026-11-20T00:00:00Z',
          }),
        )
      }
      return new Response(JSON.stringify({ detail: 'not found' }), { status: 404 })
    }),
  )
  return { masterKey, audio, encrypted, publicFileKey, song: songFrom(encrypted, 'public') }
}

const shareOf = (username: string, keyPair: KeyPairRegistration) => ({
  recipient: username, recipient_public_key: keyPair.publicKey, role: 'query', created_at: '2026-11-20T00:00:00Z',
})

describe('unpublishOwnSong', () => {
  beforeEach(() => {
    uploads = []
    uploadResponses = []
    sharesResponses = [[]]
    sharesCalls = 0
    fetchCalls = []
    tokenStore.set({ access: 'token' })
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sube el mismo audio con una File Key nueva: la llave publicada ya no lo abre', async () => {
    const { masterKey, audio, encrypted, publicFileKey, song } = await setup()
    uploadResponses = [{ status: 200, body: null }]
    const steps: UnpublishStep[] = []
    // La respuesta del servidor refleja lo subido.
    vi.spyOn(FakeXHR.prototype, 'send').mockImplementation(function (this: FakeXHR, form: FormData) {
      uploads.push(form)
      queueMicrotask(() => {
        this.status = 200
        this.responseText = JSON.stringify(okBody(form))
        this.onload?.()
      })
    })

    const saved = await unpublishOwnSong(song, masterKey, { onStep: (s) => steps.push(s) })

    expect(steps).toEqual(['downloading', 'encrypting', 'uploading'])
    expect(uploads).toHaveLength(1)
    const form = uploads[0]
    const file = form.get('file') as File
    expect(file.size).toBe(encrypted.ciphertext.size)
    expect(form.get('file_iv')).not.toBe(encrypted.fileIv)
    expect(form.get('share_keys')).toBe('{}')
    // Nada en claro: ni la File Key nueva ni el audio.
    expect([...form.keys()].sort()).toEqual(['file', 'file_iv', 'share_keys', 'wrapped_file_key', 'wrapped_key_iv'])

    const played = await decryptAudio(file, { fileIv: saved.fileIv, wrappedFileKey: saved.wrappedFileKey, wrappedKeyIv: saved.wrappedKeyIv }, masterKey)
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(audio)
    await expect(decryptPublicAudio(file, { fileIv: saved.fileIv, publicFileKey })).rejects.toThrow()
    expect(saved.visibility).toBe('private')
  })

  it('vuelve a envolver la llave nueva para cada destinatario actual', async () => {
    const { masterKey, audio, song } = await setup()
    const betoMaster = await generateMasterKey()
    const beto = await createKeyPair(betoMaster)
    sharesResponses = [[shareOf('beto', beto)]]
    vi.spyOn(FakeXHR.prototype, 'send').mockImplementation(function (this: FakeXHR, form: FormData) {
      uploads.push(form)
      queueMicrotask(() => {
        this.status = 200
        this.responseText = JSON.stringify(okBody(form))
        this.onload?.()
      })
    })

    await unpublishOwnSong(song, masterKey)

    const form = uploads[0]
    const shareKeys = JSON.parse(form.get('share_keys') as string) as Record<string, string>
    expect(Object.keys(shareKeys)).toEqual(['beto'])
    const privateKey = await unlockPrivateKey(beto.wrappedPrivateKey, beto.privateKeyIv, betoMaster)
    const played = await decryptSharedAudio(
      form.get('file') as File,
      { fileIv: form.get('file_iv') as string, sharedFileKey: shareKeys.beto },
      privateKey,
    )
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(audio)
  })

  it('si los accesos cambiaron (409 shares_changed), los vuelve a pedir y reintenta una vez', async () => {
    const { masterKey, song } = await setup()
    const carla = await createKeyPair(await generateMasterKey())
    sharesResponses = [[], [shareOf('carla', carla)]]
    uploadResponses = [
      { status: 409, body: { detail: 'Los accesos cambiaron.', code: 'shares_changed' } },
      { status: 200, body: null }, // la respuesta real la arma `okBody` con lo subido
    ]
    vi.spyOn(FakeXHR.prototype, 'send').mockImplementation(function (this: FakeXHR, form: FormData) {
      uploads.push(form)
      const response = uploadResponses[uploads.length - 1]
      queueMicrotask(() => {
        this.status = response.status
        this.responseText = JSON.stringify(response.status === 200 ? okBody(form) : response.body)
        this.onload?.()
      })
    })

    const saved = await unpublishOwnSong(song, masterKey)

    expect(saved.visibility).toBe('private')
    expect(uploads).toHaveLength(2)
    expect(JSON.parse(uploads[1].get('share_keys') as string)).toHaveProperty('carla')
    expect(sharesCalls).toBe(2)
    // El blob se descargó una sola vez.
    expect(fetchCalls.filter((c) => c.url.endsWith('/blob'))).toHaveLength(1)
  })

  it('si vuelve a fallar con 409, se rinde y lanza el error', async () => {
    const { masterKey, song } = await setup()
    uploadResponses = [{ status: 409, body: { detail: 'Los accesos cambiaron.', code: 'shares_changed' } }]

    await expect(unpublishOwnSong(song, masterKey)).rejects.toMatchObject({ status: 409, code: 'shares_changed' })
    expect(uploads).toHaveLength(2)
  })

  it('con material desactualizado (otra pestaña ya rotó la llave) no sube nada', async () => {
    const { masterKey, song } = await setup()
    const stale = { ...song, ...(await encryptAudio(new Blob([new Uint8Array(16)]), masterKey)), ciphertext: undefined }

    await expect(unpublishOwnSong(stale, masterKey)).rejects.toThrow()
    expect(uploads).toHaveLength(0)
  })

  it('no despublica canciones ajenas', async () => {
    const { masterKey, song } = await setup()
    const shared = { ...song, sharedBy: { owner: 'beto', sharedFileKey: 'x', sharedAt: '2026-11-20T00:00:00Z' } }

    await expect(unpublishOwnSong(shared, masterKey)).rejects.toThrow('Solo se pueden despublicar canciones propias.')
    expect(fetchCalls).toHaveLength(0)
  })
})

describe('publishOwnSong', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('envía la File Key junto con el IV del material del que salió', async () => {
    tokenStore.set({ access: 'token' })
    fetchCalls = []
    const { masterKey, encrypted, publicFileKey } = await setup()
    const song = songFrom(encrypted, 'private')

    await publishOwnSong(song, masterKey)

    const call = fetchCalls.find((c) => c.url === `/api/songs/${SONG_ID}/publish`)!
    expect(call.init?.method).toBe('PUT')
    expect(JSON.parse(call.init?.body as string)).toEqual({ file_key: publicFileKey, file_iv: encrypted.fileIv })
  })
})
