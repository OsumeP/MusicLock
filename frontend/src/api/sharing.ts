/**
 * Compartir canciones (Semana 4, PlanMVP §4.6). El servidor solo recibe la File
 * Key envuelta con la clave pública del destinatario.
 */

import { apiBlob, apiRequest } from './client'
import { SONGS_PAGE_SIZE, type Song, type SongPage } from './songs'

/** Destinatario encontrado por correo o usuario exactos. */
export interface Recipient {
  username: string
  /** Clave pública RSA-OAEP (SPKI, base64). */
  publicKey: string
}

export type ShareRole = 'query'

/** Un acceso a una canción propia. */
export interface Share {
  recipient: string
  role: ShareRole
  createdAt: string
}

interface ShareDto {
  recipient: string
  role: ShareRole
  created_at: string
}

const toShare = (dto: ShareDto): Share => ({ recipient: dto.recipient, role: dto.role, createdAt: dto.created_at })

const sharesPath = (songId: string) => `/songs/${encodeURIComponent(songId)}/shares`
const sharePath = (songId: string, username: string) => `${sharesPath(songId)}/${encodeURIComponent(username)}`

/**
 * Busca a quién compartir. Errores (ApiError.code): `recipient_not_found` (404),
 * `self_share` (400), `recipient_without_key` (409).
 */
export async function lookupRecipient(query: string, signal?: AbortSignal): Promise<Recipient> {
  const dto = await apiRequest<{ username: string; public_key: string }>(`/users/lookup?q=${encodeURIComponent(query.trim())}`, { signal })
  return { username: dto.username, publicKey: dto.public_key }
}

/** Quién tiene acceso a una canción propia (más reciente primero). */
export async function listShares(songId: string, signal?: AbortSignal): Promise<Share[]> {
  return (await apiRequest<ShareDto[]>(sharesPath(songId), { signal })).map(toShare)
}

/** Comparte (o renueva el acceso). `wrappedFileKey` sale de `wrapFileKeyFor` (crypto). */
export async function shareSong(songId: string, username: string, wrappedFileKey: string, role: ShareRole = 'query'): Promise<Share> {
  return toShare(await apiRequest<ShareDto>(sharePath(songId, username), { method: 'PUT', json: { wrapped_file_key: wrappedFileKey, role } }))
}

/** Revoca el acceso (idempotente). */
export function revokeShare(songId: string, username: string): Promise<void> {
  return apiRequest<void>(sharePath(songId, username), { method: 'DELETE' })
}

// --- Compartido conmigo (día 18) --------------------------------------------------

interface SharedSongDto {
  id: string
  title: string
  artist: string
  duration: number
  size: number
  creation_date: string
  file_iv: string
  shared_file_key: string
  owner: string
  shared_at: string
  role: ShareRole
}

/** Canción compartida conmigo como `Song` con `sharedBy` (sin material de la Master Key del propietario). */
export function toSharedSong(dto: SharedSongDto): Song {
  return {
    id: dto.id,
    title: dto.title,
    artist: dto.artist,
    duration: dto.duration,
    size: dto.size,
    createdAt: dto.creation_date,
    fileIv: dto.file_iv,
    wrappedFileKey: '',
    wrappedKeyIv: '',
    isFavorite: false,
    favoritedAt: null,
    sharedBy: { owner: dto.owner, sharedFileKey: dto.shared_file_key, sharedAt: dto.shared_at },
  }
}

/** "Compartido conmigo", la compartida más recientemente primero (`query` busca título, artista y propietario). */
export async function listSharedWithMe(
  { query = '', page = 1, pageSize = SONGS_PAGE_SIZE }: { query?: string; page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<SongPage> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (query.trim()) params.set('q', query.trim())
  const dto = await apiRequest<{ count: number; next: string | null; previous: string | null; results: SharedSongDto[] }>(
    `/shared?${params}`,
    { signal },
  )
  return { count: dto.count, songs: dto.results.map(toSharedSong), hasNext: !!dto.next, hasPrevious: !!dto.previous }
}

/** El audio CIFRADO de una canción compartida conmigo (404 si se revocó). */
export function downloadSharedEncryptedSong(id: string, signal?: AbortSignal): Promise<Blob> {
  return apiBlob(`/shared/${encodeURIComponent(id)}/blob`, { signal })
}
