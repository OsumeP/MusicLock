// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { decryptAudio, encryptAudio } from './audio'
import { fromBase64, randomBytes, toBase64 } from './encoding'
import { DecryptionError } from './errors'
import { generateMasterKey } from './keys'
import { decryptPublicAudio, exportFileKeyForPublishing, importPublicFileKey, rotateFileKey } from './publishing'
import { createKeyPair, decryptSharedAudio, unlockPrivateKey } from './sharing'

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

describe('despublicar: rotar la File Key', () => {
  async function publishedSong() {
    const masterKey = await generateMasterKey()
    const audio = randomBytes(4096)
    const uploaded = await encryptAudio(audio.buffer, masterKey)
    const publicFileKey = await exportFileKeyForPublishing(uploaded, masterKey)
    return { masterKey, audio, uploaded, publicFileKey }
  }

  it('el dueño descifra el blob nuevo con el material nuevo; mide lo mismo que el viejo', async () => {
    const { masterKey, audio, uploaded } = await publishedSong()

    const { encrypted, shareKeys } = await rotateFileKey(uploaded.ciphertext, uploaded, masterKey)

    expect(shareKeys).toEqual({})
    expect(encrypted.ciphertext.size).toBe(uploaded.ciphertext.size)
    expect(encrypted.fileIv).not.toBe(uploaded.fileIv)
    expect(encrypted.wrappedFileKey).not.toBe(uploaded.wrappedFileKey)
    const played = await decryptAudio(encrypted.ciphertext, encrypted, masterKey)
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(audio)
  })

  it('la llave que vio el servidor al publicar ya no abre el blob nuevo', async () => {
    const { masterKey, uploaded, publicFileKey } = await publishedSong()

    const { encrypted } = await rotateFileKey(uploaded.ciphertext, uploaded, masterKey)

    await expect(
      decryptPublicAudio(encrypted.ciphertext, { fileIv: encrypted.fileIv, publicFileKey }),
    ).rejects.toThrow(DecryptionError)
    // Tampoco con el IV viejo: es otra llave.
    await expect(
      decryptPublicAudio(encrypted.ciphertext, { fileIv: uploaded.fileIv, publicFileKey }),
    ).rejects.toThrow(DecryptionError)
    // Y la File Key nueva es distinta de la publicada.
    expect(await exportFileKeyForPublishing(encrypted, masterKey)).not.toBe(publicFileKey)
  })

  it('cada destinatario abre el blob nuevo con su clave privada', async () => {
    const { masterKey, audio, uploaded } = await publishedSong()
    const betoMaster = await generateMasterKey()
    const beto = await createKeyPair(betoMaster)
    const carla = await createKeyPair(await generateMasterKey())

    const { encrypted, shareKeys } = await rotateFileKey(uploaded.ciphertext, uploaded, masterKey, [
      { username: 'beto', publicKey: beto.publicKey },
      { username: 'carla', publicKey: carla.publicKey },
    ])

    expect(Object.keys(shareKeys).sort()).toEqual(['beto', 'carla'])
    expect(fromBase64(shareKeys.beto)).toHaveLength(384)
    const betoPrivate = await unlockPrivateKey(beto.wrappedPrivateKey, beto.privateKeyIv, betoMaster)
    const played = await decryptSharedAudio(encrypted.ciphertext, { fileIv: encrypted.fileIv, sharedFileKey: shareKeys.beto }, betoPrivate)
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(audio)
  })

  it('sin la Master Key del dueño no se puede rotar', async () => {
    const { uploaded } = await publishedSong()

    await expect(rotateFileKey(uploaded.ciphertext, uploaded, await generateMasterKey())).rejects.toThrow(DecryptionError)
  })

  it('un blob alterado no se rota', async () => {
    const { masterKey, uploaded } = await publishedSong()
    const tampered = new Uint8Array(await uploaded.ciphertext.arrayBuffer())
    tampered[100] ^= 1

    await expect(rotateFileKey(tampered.buffer, uploaded, masterKey)).rejects.toThrow(DecryptionError)
  })
})
