/**
 * Validación del archivo ANTES de cifrarlo (BR-10, BR-11).
 *
 * Tiene que hacerse en el navegador: una vez cifrado, el servidor ya no puede
 * saber si el contenido era un MP3. El servidor solo revalida el tamaño y la cuota.
 */

import { GCM_TAG_BYTES } from '../crypto'

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileValidationError'
  }
}

const MP3_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mpeg-3'])

/**
 * ¿Los primeros bytes corresponden a un MP3?
 * - "ID3": etiqueta ID3v2 al inicio (lo más común).
 * - Sincronización de trama MPEG: 11 bits en 1 y "Layer III" (bits 01 en la capa).
 */
export function hasMp3Signature(header: Uint8Array): boolean {
  if (header.length >= 3 && header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) return true
  if (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
    const layer = (header[1] >> 1) & 0x03
    return layer === 0x01
  }
  return false
}

export interface UploadLimits {
  maxFileSizeBytes: number
  storageAvailable: number
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Lanza `FileValidationError` con un mensaje para el usuario si el archivo no se puede subir. */
export async function validateMp3File(file: File, limits: UploadLimits): Promise<void> {
  const looksLikeMp3 = file.name.toLowerCase().endsWith('.mp3') || MP3_MIME_TYPES.has(file.type)
  if (!looksLikeMp3) {
    throw new FileValidationError('Solo se aceptan archivos MP3.')
  }
  if (file.size === 0) {
    throw new FileValidationError('El archivo está vacío.')
  }

  // El servidor cuenta el tamaño CIFRADO: MP3 + 16 bytes del tag de AES-GCM (decisión I11).
  const encryptedSize = file.size + GCM_TAG_BYTES
  if (encryptedSize > limits.maxFileSizeBytes) {
    throw new FileValidationError(`El archivo supera el máximo de tu plan (${formatMb(limits.maxFileSizeBytes)} por archivo).`)
  }
  if (encryptedSize > limits.storageAvailable) {
    throw new FileValidationError(`No tienes espacio suficiente: quedan ${formatMb(limits.storageAvailable)} en tu plan.`)
  }

  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (!hasMp3Signature(header)) {
    throw new FileValidationError('El archivo no parece un MP3 válido (¿se cambió la extensión de otro formato?).')
  }
}

/**
 * Duración en segundos leída por el propio navegador (antes de cifrar).
 * Redondea hacia arriba; mínimo 1 s.
 */
export function readAudioDuration(file: Blob, timeoutMs = 10_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const finish = (result: () => void) => {
      clearTimeout(timer)
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
      result()
    }
    const timer = setTimeout(
      () => finish(() => reject(new FileValidationError('No se pudo leer la duración del audio.'))),
      timeoutMs,
    )
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const seconds = audio.duration
      finish(() =>
        Number.isFinite(seconds) && seconds > 0
          ? resolve(Math.max(1, Math.ceil(seconds)))
          : reject(new FileValidationError('No se pudo leer la duración del audio.')),
      )
    }
    audio.onerror = () => finish(() => reject(new FileValidationError('El navegador no pudo leer este MP3.')))
    audio.src = url
  })
}

/** "01 - Mi Canción.mp3" → "01 - Mi Canción" */
export function titleFromFileName(name: string): string {
  return name.replace(/\.mp3$/i, '').trim().slice(0, 150) || 'Sin título'
}
