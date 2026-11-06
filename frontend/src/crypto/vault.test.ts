// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { decryptAudio, encryptAudio } from './audio'
import { fromBase64, randomBytes } from './encoding'
import { DecryptionError, UnsupportedKdfError } from './errors'
import { createVault, prepareLogin } from './vault'

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
