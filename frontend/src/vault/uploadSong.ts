/**
 * Flujo de subida (PlanMVP §4.3):
 *   validar MP3 → leer duración → cifrar con una File Key nueva → subir solo el cifrado.
 * El MP3 original nunca sale del navegador (FR-03).
 */

import { uploadEncryptedSong, type Song } from '../api/songs'
import { encryptAudio } from '../crypto'
import { readAudioDuration, validateMp3File, type UploadLimits } from './mp3'

export type UploadStage = 'validating' | 'encrypting' | 'uploading'

export interface UploadOptions {
  masterKey: CryptoKey
  limits: UploadLimits
  onStage?: (stage: UploadStage) => void
  /** Avance de la subida, de 0 a 1. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
  /** Inyectable en tests (jsdom no puede decodificar audio). */
  readDuration?: (file: Blob) => Promise<number>
}

export async function uploadSong(
  file: File,
  metadata: { title: string; artist: string },
  { masterKey, limits, onStage, onProgress, signal, readDuration = readAudioDuration }: UploadOptions,
): Promise<Song> {
  onStage?.('validating')
  await validateMp3File(file, limits)
  const duration = await readDuration(file)

  onStage?.('encrypting')
  const encrypted = await encryptAudio(file, masterKey)

  onStage?.('uploading')
  return uploadEncryptedSong(
    encrypted,
    { title: metadata.title.trim(), artist: metadata.artist.trim(), duration },
    { onProgress, signal },
  )
}
