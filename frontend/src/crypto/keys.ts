/**
 * Jerarquía de claves (decisión D3, PlanMVP §4.2):
 *
 *   KEK         ── envuelve ──► Master Key  (una por usuario; envuelve File Keys)
 *   Master Key  ── envuelve ──► File Key    (una por canción; cifra el audio)
 *
 * "Envolver" = cifrar una clave con otra (AES-GCM). Lo que se guarda en el
 * servidor es siempre la versión envuelta + su IV, en base64.
 */

import { AAD_FILE_KEY, AAD_MASTER_KEY, AES_KEY_BITS, IV_BYTES } from './constants'
import { fromBase64, randomBytes, toBase64, utf8 } from './encoding'
import { DecryptionError } from './errors'

export interface WrappedKey {
  /** Clave cifrada (incluye el tag de AES-GCM), en base64. */
  wrapped: string
  /** IV usado para envolverla, en base64. */
  iv: string
}

const AES_GCM_KEY: AesKeyGenParams = { name: 'AES-GCM', length: AES_KEY_BITS }

async function wrap(key: CryptoKey, wrappingKey: CryptoKey, context: string): Promise<WrappedKey> {
  const iv = randomBytes(IV_BYTES)
  const wrapped = await crypto.subtle.wrapKey('raw', key, wrappingKey, {
    name: 'AES-GCM',
    iv,
    additionalData: utf8(context),
  })
  return { wrapped: toBase64(wrapped), iv: toBase64(iv) }
}

async function unwrap(
  { wrapped, iv }: WrappedKey,
  unwrappingKey: CryptoKey,
  context: string,
  extractable: boolean,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      fromBase64(wrapped),
      unwrappingKey,
      { name: 'AES-GCM', iv: fromBase64(iv), additionalData: utf8(context) },
      AES_GCM_KEY,
      extractable,
      usages,
    )
  } catch (error) {
    throw new DecryptionError(undefined, { cause: error })
  }
}

// --- Master Key --------------------------------------------------------------------

/**
 * Genera una Master Key nueva (registro). Es extraíble solo para poder envolverla
 * una vez; después se usa la versión no extraíble que devuelve `unwrapMasterKey`.
 */
export function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES_GCM_KEY, true, ['wrapKey', 'unwrapKey'])
}

export function wrapMasterKey(masterKey: CryptoKey, kek: CryptoKey): Promise<WrappedKey> {
  return wrap(masterKey, kek, AAD_MASTER_KEY)
}

/**
 * Recupera la Master Key con la KEK. Por defecto NO extraíble: el código de la
 * página (o un script inyectado) puede usarla pero no leer sus bytes.
 * Lanza `DecryptionError` si la KEK no corresponde (contraseña incorrecta).
 */
export function unwrapMasterKey(wrapped: WrappedKey, kek: CryptoKey, { extractable = false } = {}): Promise<CryptoKey> {
  return unwrap(wrapped, kek, AAD_MASTER_KEY, extractable, ['wrapKey', 'unwrapKey'])
}

// --- File Keys -----------------------------------------------------------------------

/** Clave nueva para una canción. Extraíble solo para poder envolverla con la Master Key. */
export function generateFileKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES_GCM_KEY, true, ['encrypt', 'decrypt'])
}

export function wrapFileKey(fileKey: CryptoKey, masterKey: CryptoKey): Promise<WrappedKey> {
  return wrap(fileKey, masterKey, AAD_FILE_KEY)
}

/**
 * Recupera la File Key de una canción, solo para descifrar. Por defecto no
 * extraíble; `extractable` solo se usa para envolverla para otro usuario
 * (compartir, `sharing.ts`) y la clave no sale de esa función.
 */
export function unwrapFileKey(wrapped: WrappedKey, masterKey: CryptoKey, { extractable = false } = {}): Promise<CryptoKey> {
  return unwrap(wrapped, masterKey, AAD_FILE_KEY, extractable, ['decrypt'])
}
