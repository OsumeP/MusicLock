/**
 * Compartir canciones con otros usuarios sin exponer la Master Key (BR-21,
 * PlanMVP §4.6).
 *
 *   Cada usuario:  par RSA-OAEP 3072 ── pública (SPKI) → servidor
 *                                  └── privada (PKCS#8) envuelta con su Master Key → servidor
 *
 *   Compartir:     File Key de la canción ── RSA-OAEP (pública del destinatario) ──► servidor
 *   Recibir:       privada (desenvuelta con la Master Key propia) → File Key → descifra el mismo blob
 *
 * El blob no se copia ni se vuelve a cifrar: el destinatario solo recibe la File
 * Key de esa canción.
 */

import { decryptWithFileKey, type SongKeyMaterial } from './audio'
import { AAD_PRIVATE_KEY, AES_KEY_BITS, IV_BYTES, OAEP_LABEL_SHARED_FILE_KEY, RSA_MODULUS_BITS } from './constants'
import { fromBase64, randomBytes, toBase64, utf8 } from './encoding'
import { DecryptionError } from './errors'
import { unwrapFileKey } from './keys'

const RSA_OAEP: RsaHashedImportParams = { name: 'RSA-OAEP', hash: 'SHA-256' }
const RSA_KEY_GEN: RsaHashedKeyGenParams = {
  ...RSA_OAEP,
  modulusLength: RSA_MODULUS_BITS,
  publicExponent: new Uint8Array([1, 0, 1]),
}
const OAEP_PARAMS: RsaOaepParams = { name: 'RSA-OAEP', label: utf8(OAEP_LABEL_SHARED_FILE_KEY) }

/** Lo que se guarda en el servidor. La privada es inútil sin la Master Key. */
export interface KeyPairRegistration {
  /** Clave pública SPKI en base64 → `User.public_key`. */
  publicKey: string
  /** Clave privada PKCS#8 envuelta (AES-GCM) con la Master Key, base64 → `User.wrapped_private_key`. */
  wrappedPrivateKey: string
  /** IV del envoltorio, base64 → `User.private_key_iv`. */
  privateKeyIv: string
}

/** Clave pública de un usuario no válida (formato o tamaño inesperado). */
export class InvalidPublicKeyError extends Error {
  constructor(message = 'La clave pública del destinatario no es válida.', options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidPublicKeyError'
  }
}

/** Genera el par de claves y envuelve la privada con la Master Key (que nunca sale del navegador). */
export async function createKeyPair(masterKey: CryptoKey): Promise<KeyPairRegistration> {
  // Extraíble solo para exportar la pública y envolver la privada aquí mismo.
  const pair = await crypto.subtle.generateKey(RSA_KEY_GEN, true, ['wrapKey', 'unwrapKey'])
  const iv = randomBytes(IV_BYTES)
  const [spki, wrapped] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.wrapKey('pkcs8', pair.privateKey, masterKey, {
      name: 'AES-GCM',
      iv,
      additionalData: utf8(AAD_PRIVATE_KEY),
    }),
  ])
  return { publicKey: toBase64(spki), wrappedPrivateKey: toBase64(wrapped), privateKeyIv: toBase64(iv) }
}

/**
 * Recupera la clave privada propia, NO extraíble y solo para desenvolver File
 * Keys compartidas. Lanza `DecryptionError` si la Master Key no corresponde.
 */
export async function unlockPrivateKey(wrappedPrivateKey: string, privateKeyIv: string, masterKey: CryptoKey): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'pkcs8',
      fromBase64(wrappedPrivateKey),
      masterKey,
      { name: 'AES-GCM', iv: fromBase64(privateKeyIv), additionalData: utf8(AAD_PRIVATE_KEY) },
      RSA_OAEP,
      false,
      ['unwrapKey'],
    )
  } catch (error) {
    throw new DecryptionError(undefined, { cause: error })
  }
}

/** Importa la clave pública de otro usuario y comprueba que sea RSA-OAEP del tamaño esperado. */
export async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('spki', fromBase64(publicKey), RSA_OAEP, true, ['wrapKey'])
  } catch (error) {
    throw new InvalidPublicKeyError(undefined, { cause: error })
  }
  const algorithm = key.algorithm as RsaHashedKeyAlgorithm
  if (algorithm.modulusLength !== RSA_MODULUS_BITS) throw new InvalidPublicKeyError()
  return key
}

/**
 * Huella de una clave pública: SHA-256 de la SPKI, en 16 grupos de 4 hex.
 * Sirve para comprobar por otro canal (en persona, por chat) que el servidor no
 * sustituyó la clave del destinatario.
 */
export async function publicKeyFingerprint(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', fromBase64(publicKey)))
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join('')
  return hex.match(/.{4}/g)!.join(' ')
}

/**
 * Envuelve la File Key de una canción propia para un destinatario. La File Key
 * se desenvuelve extraíble solo dentro de esta función. Devuelve base64 →
 * `SongShare.wrapped_file_key`.
 */
export async function wrapFileKeyFor(material: SongKeyMaterial, masterKey: CryptoKey, recipientPublicKey: string): Promise<string> {
  const recipient = await importPublicKey(recipientPublicKey)
  const fileKey = await unwrapFileKey({ wrapped: material.wrappedFileKey, iv: material.wrappedKeyIv }, masterKey, { extractable: true })
  return toBase64(await crypto.subtle.wrapKey('raw', fileKey, recipient, OAEP_PARAMS))
}

/** Recupera (no extraíble, solo para descifrar) una File Key compartida con este usuario. */
export async function unwrapSharedFileKey(sharedFileKey: string, privateKey: CryptoKey): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      fromBase64(sharedFileKey),
      privateKey,
      OAEP_PARAMS,
      { name: 'AES-GCM', length: AES_KEY_BITS },
      false,
      ['decrypt'],
    )
  } catch (error) {
    throw new DecryptionError(undefined, { cause: error })
  }
}

/** Descifra el audio de una canción compartida con este usuario. */
export async function decryptSharedAudio(
  ciphertext: Blob | ArrayBuffer,
  material: { fileIv: string; sharedFileKey: string },
  privateKey: CryptoKey,
  mimeType = 'audio/mpeg',
): Promise<Blob> {
  const fileKey = await unwrapSharedFileKey(material.sharedFileKey, privateKey)
  return decryptWithFileKey(ciphertext, material.fileIv, fileKey, mimeType)
}
