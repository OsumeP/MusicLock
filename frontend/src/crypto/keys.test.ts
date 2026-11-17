// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { DecryptionError } from './errors'
import { deriveKeys, generateSalt } from './kdf'
import {
  generateFileKey,
  generateMasterKey,
  unwrapFileKey,
  unwrapMasterKey,
  wrapFileKey,
  wrapMasterKey,
} from './keys'

async function kekFor(password: string, salt = generateSalt()) {
  return (await deriveKeys(password, salt)).kek
}

/** Dos claves AES son "la misma" si una descifra lo que la otra cifró. */
async function assertSameFileKey(encryptKey: CryptoKey, decryptKey: CryptoKey) {
  const iv = new Uint8Array(12)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptKey, new Uint8Array([1, 2, 3]))
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, decryptKey, ciphertext)
  expect(new Uint8Array(plaintext)).toEqual(new Uint8Array([1, 2, 3]))
}

describe('Master Key', () => {
  it('se envuelve con la KEK y se recupera como clave NO extraíble', async () => {
    const kek = await kekFor('pw')
    const masterKey = await generateMasterKey()
    const wrapped = await wrapMasterKey(masterKey, kek)

    const recovered = await unwrapMasterKey(wrapped, kek)

    expect(recovered.extractable).toBe(false)
    expect(recovered.usages.sort()).toEqual(['unwrapKey', 'wrapKey'])
    // La recuperada puede abrir una File Key envuelta con la original.
    const fileKey = await generateFileKey()
    const wrappedFile = await wrapFileKey(fileKey, masterKey)
    await assertSameFileKey(fileKey, await unwrapFileKey(wrappedFile, recovered))
  })

  it('una contraseña incorrecta no la abre', async () => {
    const salt = generateSalt()
    const wrapped = await wrapMasterKey(await generateMasterKey(), await kekFor('correcta', salt))

    await expect(unwrapMasterKey(wrapped, await kekFor('incorrecta', salt))).rejects.toThrow(DecryptionError)
  })

  it('usa un IV distinto cada vez que se envuelve', async () => {
    const kek = await kekFor('pw')
    const masterKey = await generateMasterKey()
    const ivs = new Set<string>()
    for (let i = 0; i < 20; i++) {
      ivs.add((await wrapMasterKey(masterKey, kek)).iv)
    }
    expect(ivs.size).toBe(20)
  })
})

describe('File Key', () => {
  it('se recupera solo para descifrar y no es extraíble', async () => {
    const masterKey = await generateMasterKey()
    const fileKey = await generateFileKey()

    const recovered = await unwrapFileKey(await wrapFileKey(fileKey, masterKey), masterKey)

    expect(recovered.extractable).toBe(false)
    expect(recovered.usages).toEqual(['decrypt'])
    await assertSameFileKey(fileKey, recovered)
  })

  it('no se abre con la Master Key de otro usuario', async () => {
    const wrapped = await wrapFileKey(await generateFileKey(), await generateMasterKey())
    await expect(unwrapFileKey(wrapped, await generateMasterKey())).rejects.toThrow(DecryptionError)
  })

  it('una File Key envuelta no se puede hacer pasar por una Master Key envuelta (contextos AAD distintos)', async () => {
    // Un atacante que controle el servidor podría intentar intercambiar valores
    // envueltos; el contexto autenticado (AAD) lo impide.
    const masterKey = await generateMasterKey()
    const wrappedFileKey = await wrapFileKey(await generateFileKey(), masterKey)

    await expect(unwrapMasterKey(wrappedFileKey, masterKey)).rejects.toThrow(DecryptionError)
  })
})
