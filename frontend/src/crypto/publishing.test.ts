// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { encryptAudio } from './audio'
import { fromBase64, randomBytes, toBase64 } from './encoding'
import { DecryptionError } from './errors'
import { generateMasterKey } from './keys'
import { decryptPublicAudio, exportFileKeyForPublishing, importPublicFileKey } from './publishing'

describe('publicar una canción (opción A)', () => {
  it('la llave exportada permite a cualquiera descifrar el MISMO blob, sin Master Key', async () => {
    const masterKey = await generateMasterKey()
    const song = randomBytes(4096)
    const uploaded = await encryptAudio(song.buffer, masterKey)

    const publicFileKey = await exportFileKeyForPublishing(uploaded, masterKey)
    const played = await decryptPublicAudio(uploaded.ciphertext, { fileIv: uploaded.fileIv, publicFileKey })

    expect(fromBase64(publicFileKey)).toHaveLength(32)
    expect(played.type).toBe('audio/mpeg')
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(song)
  })

  it('solo el propietario puede exportarla (hace falta su Master Key)', async () => {
    const uploaded = await encryptAudio(randomBytes(1024).buffer, await generateMasterKey())

    await expect(exportFileKeyForPublishing(uploaded, await generateMasterKey())).rejects.toThrow(DecryptionError)
  })

  it('exportar no cambia la canción: la File Key envuelta sigue sirviendo y la clave importada no es extraíble', async () => {
    const masterKey = await generateMasterKey()
    const uploaded = await encryptAudio(randomBytes(1024).buffer, masterKey)

    const publicFileKey = await exportFileKeyForPublishing(uploaded, masterKey)
    const imported = await importPublicFileKey(publicFileKey)

    expect(imported.extractable).toBe(false)
    expect(imported.usages).toEqual(['decrypt'])
    // Exportar dos veces da la misma llave: es la File Key de la canción, no una nueva.
    expect(await exportFileKeyForPublishing(uploaded, masterKey)).toBe(publicFileKey)
  })

  it('una llave pública equivocada o alterada no descifra', async () => {
    const masterKey = await generateMasterKey()
    const uploaded = await encryptAudio(randomBytes(1024).buffer, masterKey)
    const other = await encryptAudio(randomBytes(1024).buffer, masterKey)
    const wrongKey = await exportFileKeyForPublishing(other, masterKey)

    await expect(
      decryptPublicAudio(uploaded.ciphertext, { fileIv: uploaded.fileIv, publicFileKey: wrongKey }),
    ).rejects.toThrow(DecryptionError)
  })

  it('rechaza llaves públicas mal formadas', async () => {
    for (const bad of ['no es base64!', toBase64(randomBytes(16)), toBase64(randomBytes(48)), '']) {
      await expect(importPublicFileKey(bad)).rejects.toThrow(DecryptionError)
    }
  })
})