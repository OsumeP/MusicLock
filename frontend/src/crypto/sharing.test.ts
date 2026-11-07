// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { encryptAudio } from './audio'
import { fromBase64, randomBytes, toBase64 } from './encoding'
import { DecryptionError } from './errors'
import { generateMasterKey } from './keys'
import {
  createKeyPair,
  decryptSharedAudio,
  importPublicKey,
  InvalidPublicKeyError,
  publicKeyFingerprint,
  unlockPrivateKey,
  wrapFileKeyFor,
} from './sharing'

/** Un usuario tal como lo ve el servidor (pública + privada envuelta) más su Master Key local. */
async function newUser() {
  const masterKey = await generateMasterKey()
  return { masterKey, stored: await createKeyPair(masterKey) }
}

describe('par de claves por usuario', () => {
  it('genera una pública RSA-OAEP 3072 y una privada envuelta que solo abre su Master Key', async () => {
    const ana = await newUser()

    expect(fromBase64(ana.stored.publicKey)).toHaveLength(422) // SPKI de RSA-3072
    expect(fromBase64(ana.stored.privateKeyIv)).toHaveLength(12)
    const privateKey = await unlockPrivateKey(ana.stored.wrappedPrivateKey, ana.stored.privateKeyIv, ana.masterKey)
    expect(privateKey.extractable).toBe(false)
    expect(privateKey.usages).toEqual(['unwrapKey'])

    await expect(unlockPrivateKey(ana.stored.wrappedPrivateKey, ana.stored.privateKeyIv, await generateMasterKey())).rejects.toThrow(
      DecryptionError,
    )
  }, 30_000)

  it('la huella es estable, distinta por usuario y con formato legible', async () => {
    const [ana, beto] = [await newUser(), await newUser()]

    const fingerprint = await publicKeyFingerprint(ana.stored.publicKey)

    expect(fingerprint).toMatch(/^([0-9A-F]{4} ){15}[0-9A-F]{4}$/)
    expect(await publicKeyFingerprint(ana.stored.publicKey)).toBe(fingerprint)
    expect(await publicKeyFingerprint(beto.stored.publicKey)).not.toBe(fingerprint)
  }, 30_000)

  it('rechaza claves públicas mal formadas o de otro tamaño', async () => {
    await expect(importPublicKey(toBase64(randomBytes(422)))).rejects.toThrow(InvalidPublicKeyError)

    const small = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['wrapKey', 'unwrapKey'],
    )
    const spki = toBase64(await crypto.subtle.exportKey('spki', small.publicKey))
    await expect(importPublicKey(spki)).rejects.toThrow(InvalidPublicKeyError)
  }, 30_000)
})

describe('compartir una canción', () => {
  it('Ana comparte con Beto: Beto descifra el MISMO blob con su privada, sin la Master Key de Ana', async () => {
    const [ana, beto] = [await newUser(), await newUser()]
    const song = randomBytes(4096)
    const uploaded = await encryptAudio(song.buffer, ana.masterKey)

    // Navegador de Ana: solo necesita la pública de Beto (la que da el servidor).
    const sharedFileKey = await wrapFileKeyFor(uploaded, ana.masterKey, beto.stored.publicKey)

    // Navegador de Beto: su privada sale del servidor envuelta con SU Master Key.
    const betoPrivate = await unlockPrivateKey(beto.stored.wrappedPrivateKey, beto.stored.privateKeyIv, beto.masterKey)
    const played = await decryptSharedAudio(uploaded.ciphertext, { fileIv: uploaded.fileIv, sharedFileKey }, betoPrivate)

    expect(new Uint8Array(await played.arrayBuffer())).toEqual(song)
  }, 30_000)

  it('un tercero no puede usar la File Key compartida con Beto', async () => {
    const [ana, beto, carla] = [await newUser(), await newUser(), await newUser()]
    const uploaded = await encryptAudio(randomBytes(1024).buffer, ana.masterKey)
    const sharedFileKey = await wrapFileKeyFor(uploaded, ana.masterKey, beto.stored.publicKey)

    const carlaPrivate = await unlockPrivateKey(carla.stored.wrappedPrivateKey, carla.stored.privateKeyIv, carla.masterKey)

    await expect(decryptSharedAudio(uploaded.ciphertext, { fileIv: uploaded.fileIv, sharedFileKey }, carlaPrivate)).rejects.toThrow(
      DecryptionError,
    )
  }, 30_000)

  it('solo el propietario puede envolver la File Key (hace falta su Master Key)', async () => {
    const [ana, beto] = [await newUser(), await newUser()]
    const uploaded = await encryptAudio(randomBytes(1024).buffer, ana.masterKey)

    await expect(wrapFileKeyFor(uploaded, beto.masterKey, beto.stored.publicKey)).rejects.toThrow(DecryptionError)
  }, 30_000)

  it('cada envoltorio es distinto (RSA-OAEP es aleatorio) y nunca contiene la File Key en claro', async () => {
    const [ana, beto] = [await newUser(), await newUser()]
    const uploaded = await encryptAudio(randomBytes(1024).buffer, ana.masterKey)

    const first = await wrapFileKeyFor(uploaded, ana.masterKey, beto.stored.publicKey)
    const second = await wrapFileKeyFor(uploaded, ana.masterKey, beto.stored.publicKey)

    expect(first).not.toBe(second)
    expect(fromBase64(first)).toHaveLength(384) // 3072 bits
  }, 30_000)
})
