/**
 * Compartir canciones (Semana 4, PlanMVP §4.6). El servidor solo recibe la File
 * Key envuelta con la clave pública del destinatario.
 */

import { apiRequest } from './client'

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
