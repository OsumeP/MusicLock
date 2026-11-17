// @vitest-environment node
import { hkdfSync, pbkdf2Sync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { DEFAULT_KDF_PARAMS, HKDF_INFO_AUTH } from './constants'
import { fromBase64 } from './encoding'
import { UnsupportedKdfError } from './errors'
import { assertSupportedKdfParams, deriveKeys, generateSalt } from './kdf'

const salt = new Uint8Array(16).fill(7)

describe('deriveKeys', () => {
  it('coincide con una implementación independiente (node:crypto) del esquema documentado', async () => {
    const password = 'contraseña segura'
    const { authKey } = await deriveKeys(password, salt)

    // PBKDF2-SHA256(600k) → HKDF-SHA256(salt vacío, info="musiclock/v1/auth-key")
    const root = pbkdf2Sync(password.normalize('NFKC'), salt, DEFAULT_KDF_PARAMS.iterations, 32, 'sha256')
    const expected = Buffer.from(hkdfSync('sha256', root, Buffer.alloc(0), HKDF_INFO_AUTH, 32))

    expect(Buffer.from(fromBase64(authKey))).toEqual(expected)
  })

  it('es determinista: misma contraseña + mismo salt = mismo authKey (login desde otro dispositivo)', async () => {
    const a = await deriveKeys('mi contraseña', salt)
    const b = await deriveKeys('mi contraseña', salt)
    expect(a.authKey).toBe(b.authKey)
  })

  it('cambia con otra contraseña o con otro salt', async () => {
    const base = await deriveKeys('mi contraseña', salt)
    const otherPassword = await deriveKeys('mi contraseña2', salt)
    const otherSalt = await deriveKeys('mi contraseña', generateSalt())

    expect(otherPassword.authKey).not.toBe(base.authKey)
    expect(otherSalt.authKey).not.toBe(base.authKey)
  })

  it('normaliza la contraseña: "é" compuesta y descompuesta dan el mismo resultado', async () => {
    const composed = await deriveKeys('canción', salt)
    const decomposed = await deriveKeys('canción', salt)
    expect(composed.authKey).toBe(decomposed.authKey)
  })

  it('entrega un authKey de 256 bits y una KEK que no se puede exportar', async () => {
    const { authKey, kek } = await deriveKeys('x', salt)

    expect(fromBase64(authKey)).toHaveLength(32)
    expect(kek.extractable).toBe(false)
    expect(kek.usages.sort()).toEqual(['unwrapKey', 'wrapKey'])
    await expect(crypto.subtle.exportKey('raw', kek)).rejects.toThrow()
  })
})

describe('assertSupportedKdfParams', () => {
  it('acepta los parámetros por defecto', () => {
    expect(() => assertSupportedKdfParams(DEFAULT_KDF_PARAMS)).not.toThrow()
  })

  it('rechaza parámetros degradados por el servidor', async () => {
    const weak = { alg: 'PBKDF2-SHA256' as const, iterations: 1000 }
    expect(() => assertSupportedKdfParams(weak)).toThrow(UnsupportedKdfError)
    await expect(deriveKeys('x', salt, weak)).rejects.toThrow(UnsupportedKdfError)
  })

  it('rechaza algoritmos desconocidos', () => {
    const unknown = { alg: 'MD5', iterations: 600_000 } as unknown as typeof DEFAULT_KDF_PARAMS
    expect(() => assertSupportedKdfParams(unknown)).toThrow(UnsupportedKdfError)
  })
})
