// @vitest-environment node
/**
 * Flujo de subida con criptografía real y un XMLHttpRequest falso que hace de
 * servidor: se comprueba QUÉ sale del navegador y que se puede descifrar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { tokenStore } from '../api/tokens'
import { decryptAudio } from '../crypto'
import { generateMasterKey } from '../crypto/keys'
import { uploadSong, type UploadStage } from './uploadSong'

const MiB = 1024 * 1024
const limits = { maxFileSizeBytes: 20 * MiB, storageAvailable: 500 * MiB }

/** Lo que "recibió el servidor" en cada envío. */
let sent: { url: string; headers: Record<string, string>; form: FormData }[] = []
let nextStatus = 201

class FakeXHR {
  status = 0
  responseText = ''
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  private url = ''
  private headers: Record<string, string> = {}

  open(_method: string, url: string) {
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  abort() {
    this.onabort?.()
  }
  send(form: FormData) {
    sent.push({ url: this.url, headers: this.headers, form })
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
      this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 })
      this.status = nextStatus
      this.responseText =
        nextStatus === 201
          ? JSON.stringify({
              id: '6f1c…',
              title: form.get('title'),
              artist: form.get('artist'),
              duration: Number(form.get('duration')),
              size: (form.get('file') as File).size,
              creation_date: '2026-11-06T12:00:00Z',
              file_iv: form.get('file_iv'),
              wrapped_file_key: form.get('wrapped_file_key'),
              wrapped_key_iv: form.get('wrapped_key_iv'),
            })
          : JSON.stringify({ detail: 'x', code: 'quota_exceeded' })
      this.onload?.()
    })
  }
}

function mp3(size = 8 * 1024) {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  bytes.set([0x49, 0x44, 0x33, 0x04]) // "ID3"
  return { bytes, file: new File([bytes], 'Mi canción secreta.mp3', { type: 'audio/mpeg' }) }
}

describe('uploadSong', () => {
  beforeEach(() => {
    sent = []
    nextStatus = 201
    tokenStore.set({ access: 'token-de-prueba' })
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sube solo el cifrado, sin el nombre original, y lo subido se puede descifrar', async () => {
    const masterKey = await generateMasterKey()
    const { bytes, file } = mp3()
    const stages: UploadStage[] = []
    const progress: number[] = []

    const song = await uploadSong(file, { title: '  Starlight  ', artist: 'Aethel' }, {
      masterKey,
      limits,
      onStage: (s) => stages.push(s),
      onProgress: (p) => progress.push(p),
      readDuration: async () => 258,
    })

    expect(stages).toEqual(['validating', 'encrypting', 'uploading'])
    expect(progress).toEqual([0.5, 1])
    expect(sent).toHaveLength(1)
    const { url, headers, form } = sent[0]
    expect(url).toBe('/api/songs')
    expect(headers.Authorization).toBe('Bearer token-de-prueba')

    const uploaded = form.get('file') as File
    expect(uploaded.name).toBe('audio.bin') // el nombre real no sale del navegador
    expect(uploaded.size).toBe(bytes.length + 16)
    const uploadedBytes = new Uint8Array(await uploaded.arrayBuffer())
    expect(Array.from(uploadedBytes.slice(0, 3))).not.toEqual([0x49, 0x44, 0x33]) // ya no es un MP3

    expect([form.get('title'), form.get('artist'), form.get('duration')]).toEqual(['Starlight', 'Aethel', '258'])
    expect(JSON.stringify([...form.entries()].filter(([k]) => k !== 'file'))).not.toContain('secreta')

    // Lo que guardó el "servidor" + la Master Key = el MP3 original.
    const decrypted = await decryptAudio(uploaded, song, masterKey)
    expect(new Uint8Array(await decrypted.arrayBuffer())).toEqual(bytes)
  })

  it('si el archivo no es válido no se cifra ni se envía nada', async () => {
    const wav = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0])], 'stem.wav', { type: 'audio/wav' })

    await expect(
      uploadSong(wav, { title: 'x', artist: '' }, { masterKey: await generateMasterKey(), limits, readDuration: async () => 1 }),
    ).rejects.toThrow('Solo se aceptan archivos MP3.')
    expect(sent).toHaveLength(0)
  })

  it('propaga los rechazos del servidor con su código', async () => {
    nextStatus = 400
    const { file } = mp3()

    await expect(
      uploadSong(file, { title: 'x', artist: '' }, { masterKey: await generateMasterKey(), limits, readDuration: async () => 1 }),
    ).rejects.toMatchObject({ status: 400, code: 'quota_exceeded' })
  })
})
