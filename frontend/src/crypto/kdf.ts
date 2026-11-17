/**
 * Derivación de claves a partir de la contraseña (decisiones D1 y D2).
 *
 *   password ──PBKDF2-SHA256(salt, 600k)──► 256 bits ──HKDF-SHA256──┬─► authKey (se envía a Django)
 *                                                                   └─► KEK     (nunca sale del navegador)
 *
 * Como HKDF usa etiquetas distintas para cada salida, conocer el authKey no
 * revela nada de la KEK: el servidor puede verificar el login sin poder
 * descifrar la bóveda.
 */

import {
  AES_KEY_BITS,
  DEFAULT_KDF_PARAMS,
  HKDF_INFO_AUTH,
  HKDF_INFO_KEK,
  MIN_PBKDF2_ITERATIONS,
  SALT_BYTES,
  type KdfParams,
} from './constants'
import { randomBytes, toBase64, utf8 } from './encoding'
import { UnsupportedKdfError } from './errors'

export interface DerivedKeys {
  /** Secreto de autenticación en base64. Va en el campo `password` del login/registro. */
  authKey: string
  /** Key Encryption Key: envuelve/desenvuelve la Master Key. No extraíble. */
  kek: CryptoKey
}

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return randomBytes(SALT_BYTES)
}

/** Rechaza parámetros desconocidos o más débiles que el mínimo (protege contra un servidor que los degrade). */
export function assertSupportedKdfParams(params: KdfParams): void {
  if (params.alg !== 'PBKDF2-SHA256') {
    throw new UnsupportedKdfError(`Algoritmo de derivación no soportado: ${String(params.alg)}`)
  }
  if (!Number.isInteger(params.iterations) || params.iterations < MIN_PBKDF2_ITERATIONS) {
    throw new UnsupportedKdfError(
      `Iteraciones insuficientes: ${params.iterations} (mínimo ${MIN_PBKDF2_ITERATIONS})`,
    )
  }
}

/**
 * Normaliza la contraseña (NFKC) para que "canción" escrita en distintos teclados
 * o sistemas operativos produzca siempre los mismos bytes.
 */
function passwordBytes(password: string): Uint8Array<ArrayBuffer> {
  return utf8(password.normalize('NFKC'))
}

export async function deriveKeys(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<DerivedKeys> {
  assertSupportedKdfParams(params)

  const passwordKey = await crypto.subtle.importKey('raw', passwordBytes(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const rootBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: params.iterations },
    passwordKey,
    256,
  )

  const rootKey = await crypto.subtle.importKey('raw', rootBits, 'HKDF', false, ['deriveBits', 'deriveKey'])
  const hkdf = (info: string): HkdfParams => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(0), // la entrada ya es uniforme (salida de PBKDF2 con salt propio)
    info: utf8(info),
  })

  const authBits = await crypto.subtle.deriveBits(hkdf(HKDF_INFO_AUTH), rootKey, 256)
  const kek = await crypto.subtle.deriveKey(
    hkdf(HKDF_INFO_KEK),
    rootKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey'],
  )

  return { authKey: toBase64(authBits), kek }
}
