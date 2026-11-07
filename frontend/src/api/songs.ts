import type { EncryptedAudio } from '../crypto'
import { apiBlob, apiRequest, apiUpload } from './client'

/** GET /api/songs/{id}/blob — el audio CIFRADO (solo el dueño). Se descifra con `decryptAudio`. */
export function downloadEncryptedSong(id: string, signal?: AbortSignal): Promise<Blob> {
  return apiBlob(`/songs/${encodeURIComponent(id)}/blob`, { signal })
}

/** Canción tal como la devuelve la API (metadatos en claro + material para descifrar). */
export interface Song {
  id: string
  title: string
  artist: string
  /** Segundos. */
  duration: number
  /** Bytes del archivo cifrado. */
  size: number
  createdAt: string
  fileIv: string
  wrappedFileKey: string
  wrappedKeyIv: string
  isFavorite: boolean
  /** Cuándo se marcó como favorita (null si no lo es). */
  favoritedAt: string | null
}

export interface SongDto {
  id: string
  title: string
  artist: string
  duration: number
  size: number
  creation_date: string
  file_iv: string
  wrapped_file_key: string
  wrapped_key_iv: string
  is_favorite?: boolean
  favorited_at?: string | null
}

export function toSong(dto: SongDto): Song {
  return {
    id: dto.id,
    title: dto.title,
    artist: dto.artist,
    duration: dto.duration,
    size: dto.size,
    createdAt: dto.creation_date,
    fileIv: dto.file_iv,
    wrappedFileKey: dto.wrapped_file_key,
    wrappedKeyIv: dto.wrapped_key_iv,
    isFavorite: dto.is_favorite ?? false,
    favoritedAt: dto.favorited_at ?? null,
  }
}

export interface SongPage {
  count: number
  songs: Song[]
  hasNext: boolean
  hasPrevious: boolean
}

export const SONGS_PAGE_SIZE = 20

/**
 * GET /api/songs — canciones propias, más recientes primero. `query` busca en título y artista;
 * `favorites` deja solo las favoritas (ordenadas por la fecha en que se marcaron).
 */
export async function listSongs(
  {
    query = '',
    page = 1,
    pageSize = SONGS_PAGE_SIZE,
    favorites = false,
  }: { query?: string; page?: number; pageSize?: number; favorites?: boolean } = {},
  signal?: AbortSignal,
): Promise<SongPage> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (query.trim()) params.set('q', query.trim())
  if (favorites) params.set('favorites', '1')
  const dto = await apiRequest<{ count: number; next: string | null; previous: string | null; results: SongDto[] }>(
    `/songs?${params}`,
    { signal },
  )
  return { count: dto.count, songs: dto.results.map(toSong), hasNext: !!dto.next, hasPrevious: !!dto.previous }
}

/** PATCH /api/songs/{id} — solo título y artista (metadatos en claro). */
export async function updateSong(id: string, changes: { title?: string; artist?: string }): Promise<Song> {
  return toSong(await apiRequest<SongDto>(`/songs/${encodeURIComponent(id)}`, { method: 'PATCH', json: changes }))
}

/** DELETE /api/songs/{id} — borra la canción y su blob; libera la cuota. */
export function deleteSong(id: string): Promise<void> {
  return apiRequest<void>(`/songs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** PUT / DELETE /api/songs/{id}/favorite — marca o desmarca (idempotente). Devuelve la canción actualizada. */
export async function setFavorite(id: string, favorite: boolean): Promise<Song> {
  return toSong(await apiRequest<SongDto>(`/songs/${encodeURIComponent(id)}/favorite`, { method: favorite ? 'PUT' : 'DELETE' }))
}

export interface SongMetadata {
  title: string
  artist: string
  duration: number
}

/** POST /api/songs — sube el audio YA cifrado. El nombre del archivo enviado no revela nada. */
export async function uploadEncryptedSong(
  encrypted: EncryptedAudio,
  metadata: SongMetadata,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<Song> {
  const form = new FormData()
  form.append('file', encrypted.ciphertext, 'audio.bin')
  form.append('title', metadata.title)
  form.append('artist', metadata.artist)
  form.append('duration', String(metadata.duration))
  form.append('file_iv', encrypted.fileIv)
  form.append('wrapped_file_key', encrypted.wrappedFileKey)
  form.append('wrapped_key_iv', encrypted.wrappedKeyIv)
  return toSong(await apiUpload<SongDto>('/songs', form, options))
}
