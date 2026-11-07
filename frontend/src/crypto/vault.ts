/**
 * Flujos de alto nivel de la bóveda (PlanMVP §4.3): lo que usan las pantallas de
 * registro, login y "Desbloquear bóveda".
 */

import { DEFAULT_KDF_PARAMS, type KdfParams } from './constants'
import { fromBase64, toBase64 } from './encoding'
import { deriveKeys, generateSalt } from './kdf'
import { generateMasterKey, unwrapMasterKey, wrapMasterKey } from './keys'

/** Datos que el registro envía al backend. Nada de esto permite descifrar sin la contraseña. */
export interface VaultRegistration {
  authKey: string
  kdfSalt: string
  kdfParams: KdfParams
  wrappedMasterKey: string
  masterKeyIv: string
}

export interface CreatedVault {
  registration: VaultRegistration
  /** Master Key lista para usar en esta sesión (no extraíble). */
  masterKey: CryptoKey
}

/** Registro: crea salt, deriva claves, genera y envuelve la Master Key. */
export async function createVault(password: string): Promise<CreatedVault> {
  const salt = generateSalt()
  const kdfParams = DEFAULT_KDF_PARAMS
  const { authKey, kek } = await deriveKeys(password, salt, kdfParams)

  const extractableMasterKey = await generateMasterKey()
  const wrapped = await wrapMasterKey(extractableMasterKey, kek)

  // Para la sesión se usa una copia NO extraíble (la extraíble se descarta aquí).
  const masterKey = await unwrapMasterKey(wrapped, kek)

  return {
    registration: {
      authKey,
      kdfSalt: toBase64(salt),
      kdfParams,
      wrappedMasterKey: wrapped.wrapped,
      masterKeyIv: wrapped.iv,
    },
    masterKey,
  }
}

/**
 * Paso 1 del login: con el salt y los parámetros que devuelve `prelogin`, obtiene
 * el authKey (para el servidor) y una función para abrir la bóveda (paso 2), que
 * se llama cuando el servidor devuelve la Master Key envuelta.
 */
export async function prepareLogin(password: string, kdfSalt: string, kdfParams: KdfParams) {
  const { authKey, kek } = await deriveKeys(password, fromBase64(kdfSalt), kdfParams)
  return {
    authKey,
    unlock: (wrappedMasterKey: string, masterKeyIv: string): Promise<CryptoKey> =>
      unwrapMasterKey({ wrapped: wrappedMasterKey, iv: masterKeyIv }, kek),
  }
}

/**
 * Cambio de contraseña (día 14, PlanMVP §4.2: "cambiar la contraseña = re-envolver
 * solo la Master Key"). Ninguna canción se vuelve a cifrar.
 *
 * Paso 1: con la contraseña ACTUAL se obtiene su authKey (el servidor lo exige para
 * entregar la Master Key envuelta). Paso 2 (`rewrap`): se desenvuelve la Master Key
 * con la KEK actual —extraíble solo dentro de esta función, para poder volver a
 * envolverla— y se envuelve con la KEK de la nueva contraseña, con un salt nuevo.
 * Lanza `DecryptionError` si la contraseña actual no abre la bóveda.
 */
export async function prepareRewrap(currentPassword: string, kdfSalt: string, kdfParams: KdfParams) {
  const { authKey, kek } = await deriveKeys(currentPassword, fromBase64(kdfSalt), kdfParams)
  return {
    authKey,
    async rewrap(wrappedMasterKey: string, masterKeyIv: string, newPassword: string): Promise<VaultRegistration> {
      const masterKey = await unwrapMasterKey({ wrapped: wrappedMasterKey, iv: masterKeyIv }, kek, { extractable: true })
      const salt = generateSalt()
      const next = await deriveKeys(newPassword, salt, DEFAULT_KDF_PARAMS)
      const wrapped = await wrapMasterKey(masterKey, next.kek)
      return {
        authKey: next.authKey,
        kdfSalt: toBase64(salt),
        kdfParams: DEFAULT_KDF_PARAMS,
        wrappedMasterKey: wrapped.wrapped,
        masterKeyIv: wrapped.iv,
      }
    },
  }
}
