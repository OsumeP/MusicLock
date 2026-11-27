import { ApiError } from '../api/client'
import { listShares } from '../api/sharing'
import { downloadEncryptedSong, publishSong, unpublishSong, type Song } from '../api/songs'
import { exportFileKeyForPublishing, rotateFileKey } from '../crypto'

/** Publica una canción propia: exporta su File Key con la Master Key y la envía al servidor. */
export async function publishOwnSong(song: Song, masterKey: CryptoKey): Promise<Song> {
  if (song.sharedBy || song.publicInfo) throw new Error('Solo se pueden publicar canciones propias.')
  return publishSong(song.id, await exportFileKeyForPublishing(song, masterKey), song.fileIv)
}

/** Paso en curso al despublicar (para mostrar el progreso). */
export type UnpublishStep = 'downloading' | 'encrypting' | 'uploading'

/**
 * Despublica una canción propia ROTANDO su File Key (la que vio el servidor deja de
 * servir): descarga el blob, lo vuelve a cifrar con una llave nueva, la envuelve
 * para cada destinatario actual y lo sube todo de una vez. Si alguien compartió o
 * revocó entretanto (409 `shares_changed`), vuelve a pedir los accesos y reintenta
 * una vez con el mismo blob descargado.
 */
export async function unpublishOwnSong(
  song: Song,
  masterKey: CryptoKey,
  {
    onStep,
    onProgress,
    signal,
  }: { onStep?: (step: UnpublishStep) => void; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<Song> {
  if (song.sharedBy || song.publicInfo) throw new Error('Solo se pueden despublicar canciones propias.')

  onStep?.('downloading')
  const ciphertext = await downloadEncryptedSong(song.id, signal)

  for (let attempt = 1; ; attempt++) {
    const shares = await listShares(song.id, signal)
    onStep?.('encrypting')
    const recipients = shares.map((share) => ({ username: share.recipient, publicKey: share.recipientPublicKey }))
    const rotated = await rotateFileKey(ciphertext, song, masterKey, recipients)
    onStep?.('uploading')
    try {
      return await unpublishSong(song.id, rotated.encrypted, rotated.shareKeys, { onProgress, signal })
    } catch (error) {
      if (attempt < 2 && error instanceof ApiError && error.code === 'shares_changed') continue
      throw error
    }
  }
}
