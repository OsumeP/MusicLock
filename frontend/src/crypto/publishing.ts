/**
 * Canciones públicas (D11, opción A): al publicar, la File Key se entrega en claro
 * al servidor para que cualquier usuario pueda descifrar el blob. La privacidad
 * del audio público es la de cualquier contenido público; el blob no cambia.
 */

import { decryptWithFileKey, type SongKeyMaterial } from './audio'
import { AES_KEY_BITS } from './constants'
import { fromBase64, toBase64 } from './encoding'
import { DecryptionError } from './errors'
import { unwrapFileKey } from './keys'

const FILE_KEY_BYTES = AES_KEY_BITS / 8

/**
 * Exporta la File Key de una canción propia en base64 → `PUT /songs/{id}/publish`.
 * Se desenvuelve extraíble solo aquí; lanza `DecryptionError` si la Master Key no
 * corresponde. Es la ÚNICA función que saca una File Key en claro del navegador.
 */
export async function exportFileKeyForPublishing(material: SongKeyMaterial, masterKey: CryptoKey): Promise<string> {
  const fileKey = await unwrapFileKey(
    { wrapped: material.wrappedFileKey, iv: material.wrappedKeyIv },
    masterKey,
    { extractable: true },
  )
  return toBase64(await crypto.subtle.exportKey('raw', fileKey))
}

/** Importa la File Key de una canción pública (no extraíble, solo para descifrar). */
export async function importPublicFileKey(publicFileKey: string): Promise<CryptoKey> {
  try {
    const raw = fromBase64(publicFileKey)
    if (raw.length !== FILE_KEY_BYTES) throw new TypeError('Longitud de llave inválida')
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
  } catch (error) {
    throw new DecryptionError(undefined, { cause: error })
  }
}

/** Descifra el audio de una canción pública con su llave pública (no hace falta ninguna clave del usuario). */
export async function decryptPublicAudio(
  ciphertext: Blob | ArrayBuffer,
  material: { fileIv: string; publicFileKey: string },
  mimeType = 'audio/mpeg',
): Promise<Blob> {
  const fileKey = await importPublicFileKey(material.publicFileKey)
  return decryptWithFileKey(ciphertext, material.fileIv, fileKey, mimeType)
}