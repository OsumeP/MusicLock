// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { decryptAudio, encryptAudio } from './audio'
import { GCM_TAG_BYTES } from './constants'
import { fromBase64, randomBytes } from './encoding'
import { DecryptionError } from './errors'
import { generateMasterKey } from './keys'

/** Simula un MP3: cabecera ID3 + datos. */
function fakeMp3(size = 64 * 1024): Uint8Array<ArrayBuffer> {
  const bytes = randomBytes(size)
  bytes.set([0x49, 0x44, 0x33, 0x04, 0x00]) // "ID3" v2.4
  return bytes
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('encryptAudio / decryptAudio', () => {
  it('ida y vuelta devuelve exactamente los mismos bytes, como audio/mpeg', async () => {
    const masterKey = await generateMasterKey()
    const mp3 = fakeMp3()

    const encrypted = await encryptAudio(new Blob([mp3]), masterKey)
    const decrypted = await decryptAudio(encrypted.ciphertext, encrypted, masterKey)

    expect(decrypted.type).toBe('audio/mpeg')
    expect(await bytesOf(decrypted)).toEqual(mp3)
  })

  it('el cifrado no se parece al original: sin cabecera ID3 y con el tamaño + 16 bytes del tag', async () => {
    const mp3 = fakeMp3()
    const { ciphertext } = await encryptAudio(mp3.buffer, await generateMasterKey())
    const bytes = await bytesOf(ciphertext)

    expect(bytes.length).toBe(mp3.length + GCM_TAG_BYTES)
    expect(Array.from(bytes.slice(0, 3))).not.toEqual([0x49, 0x44, 0x33])
    expect(ciphertext.type).toBe('application/octet-stream')
  })

  it('cifrar dos veces el mismo archivo produce resultados distintos (File Key e IV nuevos)', async () => {
    const masterKey = await generateMasterKey()
    const mp3 = fakeMp3(1024)

    const a = await encryptAudio(mp3.buffer, masterKey)
    const b = await encryptAudio(mp3.buffer, masterKey)

    expect(a.fileIv).not.toBe(b.fileIv)
    expect(a.wrappedFileKey).not.toBe(b.wrappedFileKey)
    expect(await bytesOf(a.ciphertext)).not.toEqual(await bytesOf(b.ciphertext))
    expect(fromBase64(a.fileIv)).toHaveLength(12)
  })

  it('detecta si un solo byte del archivo cifrado fue alterado', async () => {
    const masterKey = await generateMasterKey()
    const encrypted = await encryptAudio(fakeMp3(1024).buffer, masterKey)
    const tampered = await bytesOf(encrypted.ciphertext)
    tampered[100] ^= 0x01

    await expect(decryptAudio(tampered.buffer as ArrayBuffer, encrypted, masterKey)).rejects.toThrow(DecryptionError)
  })

  it('otra Master Key no puede descifrar la canción', async () => {
    const encrypted = await encryptAudio(fakeMp3(1024).buffer, await generateMasterKey())

    await expect(decryptAudio(encrypted.ciphertext, encrypted, await generateMasterKey())).rejects.toThrow(
      DecryptionError,
    )
  })

  it('un IV equivocado (p. ej. de otra canción) impide descifrar', async () => {
    const masterKey = await generateMasterKey()
    const song1 = await encryptAudio(fakeMp3(1024).buffer, masterKey)
    const song2 = await encryptAudio(fakeMp3(1024).buffer, masterKey)

    await expect(
      decryptAudio(song1.ciphertext, { ...song1, fileIv: song2.fileIv }, masterKey),
    ).rejects.toThrow(DecryptionError)
  })
})
