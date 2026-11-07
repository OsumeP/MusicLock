/**
 * Reproductor con criptografía real: el "servidor" (fetch simulado) solo tiene
 * el cifrado; se comprueba que lo que llega al <audio> es el MP3 original y que
 * las URLs blob: se liberan.
 */
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { toSong, type Song } from '../api/songs'
import { tokenStore } from '../api/tokens'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { encryptAudio } from '../crypto'
import { generateMasterKey } from '../crypto/keys'
import { usePlayer, type PlayerContextValue } from './playerContext'
import { PlayerProvider } from './PlayerProvider'

const user = { id: 1, email: 'a@x.com', username: 'ana', plan: { code: 'free', name: 'Free', maxStorageBytes: 1, maxFileSizeBytes: 1 }, usedStorage: 0, storageAvailable: 1 } as User

/** Blobs servidos por el "servidor" (cifrados), por id de canción. */
let server: Map<string, { status: number; body: BodyInit | null }>
let createdUrls: { url: string; blob: Blob }[]
let revokedUrls: string[]
let fetchCalls: { url: string; auth?: string }[]

async function makeSong(id: string, masterKey: CryptoKey, bytes: Uint8Array<ArrayBuffer>) {
  const encrypted = await encryptAudio(new Blob([bytes]), masterKey)
  server.set(id, { status: 200, body: await encrypted.ciphertext.arrayBuffer() })
  return toSong({
    id,
    title: `Canción ${id}`,
    artist: '',
    duration: 60,
    size: encrypted.ciphertext.size,
    creation_date: '2026-11-06T00:00:00Z',
    file_iv: encrypted.fileIv,
    wrapped_file_key: encrypted.wrappedFileKey,
    wrapped_key_iv: encrypted.wrappedKeyIv,
  })
}

function fakeMp3(seed: number) {
  const bytes = new Uint8Array(4096).fill(seed)
  bytes.set([0x49, 0x44, 0x33])
  return bytes
}

async function renderPlayer(masterKey: CryptoKey) {
  let player!: PlayerContextValue
  function Probe() {
    player = usePlayer()
    return null
  }
  const auth = { session: { status: 'ready', user, masterKey } } as AuthContextValue
  const view = render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <Probe />
      </PlayerProvider>
    </AuthContext.Provider>,
  )
  return { get player() { return player }, view, audio: () => document.querySelector('audio')! }
}

describe('PlayerProvider', () => {
  let masterKey: CryptoKey

  beforeEach(async () => {
    masterKey = await generateMasterKey()
    server = new Map()
    createdUrls = []
    revokedUrls = []
    fetchCalls = []
    tokenStore.set({ access: 'token' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization })
        const id = url.split('/')[3]
        const entry = server.get(id) ?? { status: 404, body: JSON.stringify({ code: 'not_found' }) }
        return new Response(entry.body, { status: entry.status })
      }),
    )
    let n = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      const url = `blob:musiclock/${++n}`
      createdUrls.push({ url, blob: blob as Blob })
      return url
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revokedUrls.push(url))
    // jsdom no reproduce medios: se simulan play/pause/load emitiendo sus eventos.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'))
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'))
    })
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('descarga el cifrado, lo descifra en memoria y entrega el MP3 original al <audio>', async () => {
    const original = fakeMp3(7)
    const song = await makeSong('s1', masterKey, original)
    const harness = await renderPlayer(masterKey)

    act(() => harness.player.play(song))

    await waitFor(() => expect(harness.player.status).toBe('playing'))
    expect(fetchCalls[0]).toEqual({ url: '/api/songs/s1/blob', auth: 'Bearer token' })
    expect(createdUrls).toHaveLength(1)
    const { url, blob } = createdUrls[0]
    expect(blob.type).toBe('audio/mpeg')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(original)
    expect(harness.audio().getAttribute('src')).toBe(url)
    expect(harness.player.current?.id).toBe('s1')
  })

  it('al cambiar de canción libera la URL anterior; anterior/siguiente recorren la cola', async () => {
    const songs: Song[] = [
      await makeSong('a', masterKey, fakeMp3(1)),
      await makeSong('b', masterKey, fakeMp3(2)),
      await makeSong('c', masterKey, fakeMp3(3)),
    ]
    const harness = await renderPlayer(masterKey)

    act(() => harness.player.play(songs[0], songs))
    await waitFor(() => expect(harness.player.status).toBe('playing'))
    expect(harness.player.hasPrevious).toBe(false)

    act(() => harness.player.next())
    await waitFor(() => expect(harness.player.current?.id).toBe('b'))
    await waitFor(() => expect(createdUrls).toHaveLength(2))
    expect(revokedUrls).toContain(createdUrls[0].url)

    act(() => harness.player.next())
    await waitFor(() => expect(harness.player.current?.id).toBe('c'))
    expect(harness.player.hasNext).toBe(false)

    act(() => harness.player.previous())
    await waitFor(() => expect(harness.player.current?.id).toBe('b'))
  })

  it('pausa y reanuda', async () => {
    const song = await makeSong('s1', masterKey, fakeMp3(1))
    const harness = await renderPlayer(masterKey)
    act(() => harness.player.play(song))
    await waitFor(() => expect(harness.player.status).toBe('playing'))

    act(() => harness.player.togglePlay())
    // jsdom: `paused` es siempre true, así que togglePlay llama play(); se comprueba vía evento.
    act(() => harness.audio().dispatchEvent(new Event('pause')))
    expect(harness.player.status).toBe('paused')
  })

  it('un cifrado alterado no se reproduce y muestra un error claro', async () => {
    const song = await makeSong('s1', masterKey, fakeMp3(1))
    const tampered = new Uint8Array(server.get('s1')!.body as ArrayBuffer)
    tampered[10] ^= 0xff
    server.set('s1', { status: 200, body: tampered })
    const harness = await renderPlayer(masterKey)

    act(() => harness.player.play(song))

    await waitFor(() => expect(harness.player.status).toBe('error'))
    expect(harness.player.error).toMatch(/alterado/)
    expect(createdUrls).toHaveLength(0)
  })

  it('con la Master Key de otro usuario no se puede descifrar', async () => {
    const song = await makeSong('s1', await generateMasterKey(), fakeMp3(1))
    const harness = await renderPlayer(masterKey)

    act(() => harness.player.play(song))

    await waitFor(() => expect(harness.player.status).toBe('error'))
    expect(createdUrls).toHaveLength(0)
  })

  it('informa cuando falta el archivo cifrado en el servidor', async () => {
    const song = await makeSong('s1', masterKey, fakeMp3(1))
    server.set('s1', { status: 404, body: JSON.stringify({ detail: 'x', code: 'blob_missing' }) })
    const harness = await renderPlayer(masterKey)

    act(() => harness.player.play(song))

    await waitFor(() => expect(harness.player.error).toMatch(/no está disponible/))
  })

  it('forget: si se elimina la canción actual, se detiene y se libera su audio; si es otra, sale de la cola', async () => {
    const songs: Song[] = [
      await makeSong('a', masterKey, fakeMp3(1)),
      await makeSong('b', masterKey, fakeMp3(2)),
      await makeSong('c', masterKey, fakeMp3(3)),
    ]
    const harness = await renderPlayer(masterKey)
    act(() => harness.player.play(songs[1], songs))
    await waitFor(() => expect(harness.player.status).toBe('playing'))

    act(() => harness.player.forget('a'))
    expect(harness.player.queue.map((s) => s.id)).toEqual(['b', 'c'])
    expect(harness.player.current?.id).toBe('b')
    expect(harness.player.hasPrevious).toBe(false)

    act(() => harness.player.forget('b'))
    expect(harness.player.status).toBe('idle')
    expect(harness.player.current).toBeNull()
    expect(revokedUrls).toContain(createdUrls[0].url)
  })

  it('al salir de la bóveda (desmontar) libera el audio descifrado', async () => {
    const song = await makeSong('s1', masterKey, fakeMp3(1))
    const harness = await renderPlayer(masterKey)
    act(() => harness.player.play(song))
    await waitFor(() => expect(createdUrls).toHaveLength(1))

    harness.view.unmount()

    expect(revokedUrls).toContain(createdUrls[0].url)
  })

  it('registra una reproducción por canción cargada (pausar y reanudar no cuenta) y avisa con historyVersion', async () => {
    const realFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith('/plays')) {
        fetchCalls.push({ url: String(url) })
        const id = String(url).split('/')[3]
        return new Response(JSON.stringify({ id: 1, played_at: '2026-11-06T00:00:00Z', song: { id } }), { status: 201 })
      }
      return realFetch(url, init)
    })
    const a = await makeSong('a', masterKey, fakeMp3(1))
    const b = await makeSong('b', masterKey, fakeMp3(2))
    const harness = await renderPlayer(masterKey)
    const plays = () => fetchCalls.filter((c) => c.url.endsWith('/plays')).map((c) => c.url)

    act(() => harness.player.play(a, [a, b]))
    await waitFor(() => expect(harness.player.historyVersion).toBe(1))
    act(() => harness.player.togglePlay()) // pausa
    act(() => harness.player.togglePlay()) // reanuda
    await waitFor(() => expect(harness.player.status).toBe('playing'))
    expect(plays()).toEqual(['/api/songs/a/plays'])

    act(() => harness.player.next())
    await waitFor(() => expect(harness.player.historyVersion).toBe(2))
    expect(plays()).toEqual(['/api/songs/a/plays', '/api/songs/b/plays'])
  })

  it('si registrar la reproducción falla, el audio sigue sonando', async () => {
    const song = await makeSong('s1', masterKey, fakeMp3(3)) // el mock responde a /plays con bytes no JSON
    const harness = await renderPlayer(masterKey)

    act(() => harness.player.play(song))

    await waitFor(() => expect(fetchCalls.some((c) => c.url.endsWith('/plays'))).toBe(true))
    expect(harness.player.status).toBe('playing')
    expect(harness.player.historyVersion).toBe(0)
  })

  describe('modos de reproducción (patrón Iterator)', () => {
    async function fourSongs() {
      return [
        await makeSong('a', masterKey, fakeMp3(1)),
        await makeSong('b', masterKey, fakeMp3(2)),
        await makeSong('c', masterKey, fakeMp3(3)),
        await makeSong('d', masterKey, fakeMp3(4)),
      ]
    }
    const blobDownloads = () => fetchCalls.filter((c) => c.url.endsWith('/blob')).length

    it('aleatorio: empieza por la elegida y "siguiente" recorre todas una vez; al desactivarlo vuelve al orden original', async () => {
      const songs = await fourSongs()
      const harness = await renderPlayer(masterKey)
      act(() => harness.player.setShuffle(true))
      act(() => harness.player.play(songs[0], songs))
      await waitFor(() => expect(harness.player.status).toBe('playing'))
      expect(harness.player.shuffle).toBe(true)
      expect(harness.player.current?.id).toBe('a')
      expect(harness.player.queue.map((s) => s.id).sort()).toEqual(['a', 'b', 'c', 'd'])

      const heard = ['a']
      while (harness.player.hasNext) {
        act(() => harness.player.next())
        heard.push(harness.player.current!.id)
      }
      expect([...heard].sort()).toEqual(['a', 'b', 'c', 'd'])
      expect(heard).toEqual(harness.player.queue.map((s) => s.id))

      // Sin aleatorio, se sigue por el orden original desde la canción actual.
      const now = harness.player.current!.id
      act(() => harness.player.setShuffle(false))
      expect(harness.player.current?.id).toBe(now)
      expect(harness.player.queue.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('playAll con shuffle activa el modo aleatorio', async () => {
      const songs = await fourSongs()
      const harness = await renderPlayer(masterKey)

      act(() => harness.player.playAll(songs, { shuffle: true }))

      await waitFor(() => expect(harness.player.status).toBe('playing'))
      expect(harness.player.shuffle).toBe(true)
      expect(harness.player.queue[0].id).toBe(harness.player.current?.id)
    })

    it('al terminar la última: sin repetir se detiene; con repetir vuelve a la primera', async () => {
      const songs = await fourSongs()
      const harness = await renderPlayer(masterKey)
      act(() => harness.player.play(songs[3], songs))
      await waitFor(() => expect(harness.player.status).toBe('playing'))

      act(() => harness.audio().dispatchEvent(new Event('ended')))
      expect(harness.player.status).toBe('paused')
      expect(harness.player.current?.id).toBe('d')

      act(() => harness.player.setRepeat(true))
      expect(harness.player.hasNext).toBe(true)
      act(() => harness.audio().dispatchEvent(new Event('ended')))
      await waitFor(() => expect(harness.player.current?.id).toBe('a'))
      await waitFor(() => expect(harness.player.status).toBe('playing'))
    })

    it('repetir con una sola canción la reinicia sin volver a descargarla y cuenta otra reproducción', async () => {
      const realFetch = vi.mocked(fetch).getMockImplementation()!
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (String(url).endsWith('/plays')) {
          fetchCalls.push({ url: String(url) })
          return new Response(JSON.stringify({ id: 1, played_at: '2026-11-06T00:00:00Z', song: { id: 's1' } }), { status: 201 })
        }
        return realFetch(url, init)
      })
      const song = await makeSong('s1', masterKey, fakeMp3(1))
      const harness = await renderPlayer(masterKey)
      act(() => harness.player.setRepeat(true))
      act(() => harness.player.play(song))
      await waitFor(() => expect(harness.player.historyVersion).toBe(1))

      act(() => harness.audio().dispatchEvent(new Event('ended')))

      await waitFor(() => expect(harness.player.historyVersion).toBe(2))
      expect(blobDownloads()).toBe(1)
      expect(createdUrls).toHaveLength(1)
      expect(harness.player.current?.id).toBe('s1')
    })

    it('activar repetir con la cola barajada conserva el orden', async () => {
      const songs = await fourSongs()
      const harness = await renderPlayer(masterKey)
      act(() => harness.player.playAll(songs, { shuffle: true }))
      await waitFor(() => expect(harness.player.status).toBe('playing'))
      const order = harness.player.queue.map((s) => s.id)

      act(() => harness.player.setRepeat(true))

      expect(harness.player.queue.map((s) => s.id)).toEqual(order)
      expect(harness.player.hasPrevious).toBe(true) // en bucle, "anterior" desde la primera va a la última
    })
  })
})
