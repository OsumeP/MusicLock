/**
 * Descarga del MP3 original (Audio FR-05): se baja el cifrado, se descifra en
 * memoria y se entrega al navegador como un archivo .mp3. El servidor nunca ve
 * el archivo en claro.
 */

import { downloadEncryptedSong, type Song } from '../api/songs'
import { decryptAudio } from '../crypto'

/** "AC/DC: Live?" → "AC-DC- Live-" (caracteres no válidos en nombres de archivo de Windows/macOS/Linux). */
export function safeFileName(title: string): string {
  // Los caracteres de control se eliminan a propósito: no son válidos en nombres de archivo.
  // eslint-disable-next-line no-control-regex
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
  return `${cleaned || 'cancion'}.mp3`
}

/** Descifra la canción y devuelve el MP3 original (sin guardarlo). */
export async function decryptSongToBlob(song: Song, masterKey: CryptoKey, signal?: AbortSignal): Promise<Blob> {
  const encrypted = await downloadEncryptedSong(song.id, signal)
  return decryptAudio(encrypted, song, masterKey)
}

/** Descifra y dispara la descarga del archivo original en el navegador. */
export async function downloadOriginalSong(song: Song, masterKey: CryptoKey): Promise<void> {
  const mp3 = await decryptSongToBlob(song, masterKey)
  const url = URL.createObjectURL(mp3)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = safeFileName(song.title)
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
  } finally {
    // Se libera en el siguiente ciclo: el navegador ya inició la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
