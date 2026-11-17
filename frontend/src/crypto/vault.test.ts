// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { decryptAudio, encryptAudio } from './audio'
import { fromBase64, randomBytes } from './encoding'
import { DecryptionError, UnsupportedKdfError } from './errors'
import { createVault, prepareLogin, prepareRewrap } from './vault'

const PASSWORD = 'Mi contraseña muy segura 2026'

describe('flujo completo de la bóveda', () => {
  it('registro en un dispositivo → login en otro → descifra lo subido en el primero', async () => {
    // Dispositivo A: registro y subida
    const { registration, masterKey } = await createVault(PASSWORD)
    const song = randomBytes(4096)
    const uploaded = await encryptAudio(song.buffer, masterKey)

    // Dispositivo B: solo tiene lo que guarda el servidor + la contraseña
    const login = await prepareLogin(PASSWORD, registration.kdfSalt, registration.kdfParams)
    expect(login.authKey).toBe(registration.authKey) // el servidor acepta el login
    const masterKeyB = await login.unlock(registration.wrappedMasterKey, registration.masterKeyIv)

    const played = await decryptAudio(uploaded.ciphertext, uploaded, masterKeyB)
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(song)
  })

  it('con una contraseña incorrecta el authKey no coincide y la bóveda no abre', async () => {
    const { registration } = await createVault(PASSWORD)

    const login = await prepareLogin('otra contraseña', registration.kdfSalt, registration.kdfParams)

    expect(login.authKey).not.toBe(registration.authKey)
    await expect(login.unlock(registration.wrappedMasterKey, registration.masterKeyIv)).rejects.toThrow(
      DecryptionError,
    )
  })

  it('lo que se envía al servidor no contiene la contraseña y la Master Key de sesión no es extraíble', async () => {
    const { registration, masterKey } = await createVault(PASSWORD)

    expect(JSON.stringify(registration)).not.toContain(PASSWORD)
    expect(fromBase64(registration.kdfSalt)).toHaveLength(16)
    expect(registration.kdfParams).toEqual({ alg: 'PBKDF2-SHA256', iterations: 600_000 })
    expect(masterKey.extractable).toBe(false)
  })

  it('dos registros con la misma contraseña generan salt, authKey y Master Key distintos', async () => {
    const a = await createVault(PASSWORD)
    const b = await createVault(PASSWORD)

    expect(a.registration.kdfSalt).not.toBe(b.registration.kdfSalt)
    expect(a.registration.authKey).not.toBe(b.registration.authKey)
    expect(a.registration.wrappedMasterKey).not.toBe(b.registration.wrappedMasterKey)
  })

  it('el login rechaza parámetros de derivación degradados por el servidor', async () => {
    const { registration } = await createVault(PASSWORD)

    await expect(
      prepareLogin(PASSWORD, registration.kdfSalt, { alg: 'PBKDF2-SHA256', iterations: 10 }),
    ).rejects.toThrow(UnsupportedKdfError)
  })
})

describe('cambio de contraseña (re-envolver la Master Key)', () => {
  const NEW_PASSWORD = 'Otra frase distinta y larga 2026'

  it('la contraseña nueva abre la MISMA Master Key: lo subido antes se descifra sin volver a cifrarlo', async () => {
    const { registration, masterKey } = await createVault(PASSWORD)
    const song = randomBytes(4096)
    const uploaded = await encryptAudio(song.buffer, masterKey)

    const change = await prepareRewrap(PASSWORD, registration.kdfSalt, registration.kdfParams)
    expect(change.authKey).toBe(registration.authKey) // el servidor acepta la contraseña actual
    const updated = await change.rewrap(registration.wrappedMasterKey, registration.masterKeyIv, NEW_PASSWORD)

    expect(updated.kdfSalt).not.toBe(registration.kdfSalt)
    expect(updated.authKey).not.toBe(registration.authKey)
    expect(JSON.stringify(updated)).not.toContain(NEW_PASSWORD)

    // Login con la contraseña nueva (otro dispositivo): abre la bóveda y descifra lo anterior.
    const login = await prepareLogin(NEW_PASSWORD, updated.kdfSalt, updated.kdfParams)
    expect(login.authKey).toBe(updated.authKey)
    const masterKeyAfter = await login.unlock(updated.wrappedMasterKey, updated.masterKeyIv)
    expect(masterKeyAfter.extractable).toBe(false)
    const played = await decryptAudio(uploaded.ciphertext, uploaded, masterKeyAfter)
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(song)

    // La contraseña anterior ya no abre el material nuevo.
    const old = await prepareLogin(PASSWORD, updated.kdfSalt, updated.kdfParams)
    await expect(old.unlock(updated.wrappedMasterKey, updated.masterKeyIv)).rejects.toThrow(DecryptionError)
  })

  it('con una contraseña actual incorrecta no se puede re-envolver', async () => {
    const { registration } = await createVault(PASSWORD)

    const change = await prepareRewrap('no es la contraseña', registration.kdfSalt, registration.kdfParams)

    expect(change.authKey).not.toBe(registration.authKey)
    await expect(change.rewrap(registration.wrappedMasterKey, registration.masterKeyIv, NEW_PASSWORD)).rejects.toThrow(DecryptionError)
  })
})
