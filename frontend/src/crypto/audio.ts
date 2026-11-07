/**
 * Cifrado y descifrado de archivos de audio (PlanMVP §4.3).
 *
 * Todo el archivo se cifra en memoria con AES-GCM en una sola operación; con el
 * límite de 20 MiB del plan Free es rápido y sencillo. El cifrado por bloques
 * para archivos grandes (Premium, 100 MiB) está en el backlog.
 */

import { AAD_AUDIO, IV_BYTES } from './constants'
import { fromBase64, randomBytes, toBase64, utf8 } from './encoding'
import { DecryptionError } from './errors'
import { generateFileKey, unwrapFileKey, wrapFileKey } from './keys'

/** Lo que se sube al servidor: el audio cifrado + el material para descifrarlo (todo inútil sin la Master Key). */
export interface EncryptedAudio {
  ciphertext: Blob
  /** IV del audio, en base64 → `Song.file_iv`. */
  fileIv: string
  /** File Key envuelta con la Master Key, en base64 → `Song.wrapped_file_key`. */
  wrappedFileKey: string
  /** IV del envoltorio, en base64 → `Song.wrapped_key_iv`. */
  wrappedKeyIv: string
}

/** Material de una canción tal como lo devuelve la API. */
export interface SongKeyMaterial {
  fileIv: string
  wrappedFileKey: string
  wrappedKeyIv: string
}

/**
 * Bytes del archivo como vista `Uint8Array`. Se envuelve en una vista (en lugar
 * de pasar el ArrayBuffer tal cual) porque algunos entornos, como jsdom en los
 * tests, entregan ArrayBuffers de otro "realm" que Web Crypto rechaza; en los
 * navegadores no cambia nada.
 */
async function toBytes(data: Blob | ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  // Se comprueba por capacidad y no con `instanceof Blob`, que también falla entre realms.
  const isBlobLike = typeof (data as Blob).arrayBuffer === 'function'
  return new Uint8Array(isBlobLike ? await (data as Blob).arrayBuffer() : (data as ArrayBuffer))
}

/** Cifra un archivo con una File Key nueva y la envuelve con la Master Key. */
export async function encryptAudio(file: Blob | ArrayBuffer, masterKey: CryptoKey): Promise<EncryptedAudio> {
  const fileKey = await generateFileKey()
  const iv = randomBytes(IV_BYTES)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(AAD_AUDIO) },
    fileKey,
    await toBytes(file),
  )
  const wrapped = await wrapFileKey(fileKey, masterKey)

  return {
    ciphertext: new Blob([ciphertext], { type: 'application/octet-stream' }),
    fileIv: toBase64(iv),
    wrappedFileKey: wrapped.wrapped,
    wrappedKeyIv: wrapped.iv,
  }
}

/**
 * Descifra en memoria un audio descargado del servidor.
 * Lanza `DecryptionError` si la clave no corresponde o si el archivo fue alterado
 * (AES-GCM detecta cualquier byte modificado).
 */
export async function decryptAudio(
  ciphertext: Blob | ArrayBuffer,
  material: SongKeyMaterial,
  masterKey: CryptoKey,
  mimeType = 'audio/mpeg',
): Promise<Blob> {
  const fileKey = await unwrapFileKey({ wrapped: material.wrappedFileKey, iv: material.wrappedKeyIv }, masterKey)
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(material.fileIv), additionalData: utf8(AAD_AUDIO) },
      fileKey,
      await toBytes(ciphertext),
    )
    return new Blob([plaintext], { type: mimeType })
  } catch (error) {
    throw new DecryptionError(undefined, { cause: error })
  }
}
