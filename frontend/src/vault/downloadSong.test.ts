import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toSong } from '../api/songs'
import { tokenStore } from '../api/tokens'
import { encryptAudio } from '../crypto'
import { generateMasterKey } from '../crypto/keys'
import { downloadOriginalSong, safeFileName } from './downloadSong'

describe('safeFileName', () => {
  it('quita caracteres no válidos y añade .mp3', () => {
    expect(safeFileName('AC/DC: Live?')).toBe('AC-DC- Live-.mp3')
    expect(safeFileName('  Nocturno   en La menor ')).toBe('Nocturno en La menor.mp3')
    expect(safeFileName('***')).toBe('---.mp3')
    expect(safeFileName('   ')).toBe('cancion.mp3')
  })
})

describe('downloadOriginalSong', () => {
  let created: Blob[]
  let revoked: string[]
  let clicked: { href: string; download: string }[]

  beforeEach(() => {
    created = []
    revoked = []
    clicked = []
    tokenStore.set({ access: 'token' })
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob as Blob)
      return 'blob:musiclock/descarga'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download })
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('descifra en memoria y descarga el MP3 original con el título como nombre', async () => {
    const masterKey = await generateMasterKey()
    const original = new Uint8Array(5000).fill(9)
    original.set([0x49, 0x44, 0x33])
    const encrypted = await encryptAudio(new Blob([original]), masterKey)
    const ciphertext = await encrypted.ciphertext.arrayBuffer()
    const fetchMock = vi.fn(async () => new Response(ciphertext))
    vi.stubGlobal('fetch', fetchMock)
    const song = toSong({
      id: 'abc', title: 'Nocturno: versión 2', artist: '', duration: 1, size: ciphertext.byteLength,
      creation_date: '', file_iv: encrypted.fileIv, wrapped_file_key: encrypted.wrappedFileKey, wrapped_key_iv: encrypted.wrappedKeyIv,
    })

    await downloadOriginalSong(song, masterKey)

    expect(fetchMock).toHaveBeenCalledWith('/api/songs/abc/blob', expect.anything())
    expect(clicked).toEqual([{ href: 'blob:musiclock/descarga', download: 'Nocturno- versión 2.mp3' }])
    expect(created[0].type).toBe('audio/mpeg')
    expect(new Uint8Array(await created[0].arrayBuffer())).toEqual(original)
    expect(document.querySelector('a[download]')).toBeNull() // el enlace temporal se retira

    vi.runAllTimers()
    expect(revoked).toEqual(['blob:musiclock/descarga'])
  })
})
