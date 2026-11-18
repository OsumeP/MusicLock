import { publishSong, unpublishSong, type Song } from '../api/songs'
import { exportFileKeyForPublishing } from '../crypto'

/** Publica una canción propia: exporta su File Key con la Master Key y la envía al servidor. */
export async function publishOwnSong(song: Song, masterKey: CryptoKey): Promise<Song> {
  if (song.sharedBy) throw new Error('Solo se pueden publicar canciones propias.')
  return publishSong(song.id, await exportFileKeyForPublishing(song, masterKey))
}

export const unpublishOwnSong = (song: Song): Promise<Song> => unpublishSong(song.id)