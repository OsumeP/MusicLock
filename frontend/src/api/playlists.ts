import { apiRequest } from './client'
import { toSong, type Song, type SongDto } from './songs'

/** Resumen de una playlist (metadatos en claro; las canciones siguen cifradas en la bóveda). */
export interface Playlist {
  id: string
  name: string
  description: string
  songCount: number
  /** Bytes cifrados de todas sus canciones. */
  totalSize: number
  /** Segundos. */
  totalDuration: number
  createdAt: string
  updatedAt: string
  /** Solo si se pidió con `listPlaylists({ containing })`. */
  containsSong?: boolean
}

export interface PlaylistDetail extends Playlist {
  /** En el orden de la playlist. */
  songs: Song[]
}

interface PlaylistDto {
  id: string
  name: string
  description: string
  song_count: number
  total_size: number
  total_duration: number
  created_at: string
  updated_at: string
  contains_song?: boolean
}

function toPlaylist(dto: PlaylistDto): Playlist {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    songCount: dto.song_count,
    totalSize: dto.total_size,
    totalDuration: dto.total_duration,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    ...(dto.contains_song !== undefined && { containsSong: dto.contains_song }),
  }
}

const path = (id: string) => `/playlists/${encodeURIComponent(id)}`
const songPath = (playlistId: string, songId: string) => `${path(playlistId)}/songs/${encodeURIComponent(songId)}`

/** GET /api/playlists — propias, la modificada más recientemente primero. `containing`: marca cuáles tienen esa canción. */
export async function listPlaylists({ containing }: { containing?: string } = {}, signal?: AbortSignal): Promise<Playlist[]> {
  const query = containing ? `?song=${encodeURIComponent(containing)}` : ''
  return (await apiRequest<PlaylistDto[]>(`/playlists${query}`, { signal })).map(toPlaylist)
}

/** GET /api/playlists/{id} — con sus canciones en orden. */
export async function getPlaylist(id: string, signal?: AbortSignal): Promise<PlaylistDetail> {
  const dto = await apiRequest<PlaylistDto & { songs: SongDto[] }>(path(id), { signal })
  return { ...toPlaylist(dto), songs: dto.songs.map(toSong) }
}

export async function createPlaylist(data: { name: string; description?: string }): Promise<Playlist> {
  return toPlaylist(await apiRequest<PlaylistDto>('/playlists', { method: 'POST', json: data }))
}

export async function updatePlaylist(id: string, changes: { name?: string; description?: string }): Promise<Playlist> {
  return toPlaylist(await apiRequest<PlaylistDto>(path(id), { method: 'PATCH', json: changes }))
}

/** Borra la playlist; las canciones siguen en la bóveda. */
export function deletePlaylist(id: string): Promise<void> {
  return apiRequest<void>(path(id), { method: 'DELETE' })
}

/** Añade al final (si ya estaba, no cambia nada). */
export async function addSongToPlaylist(playlistId: string, songId: string): Promise<Playlist> {
  return toPlaylist(await apiRequest<PlaylistDto>(songPath(playlistId, songId), { method: 'PUT' }))
}

export function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  return apiRequest<void>(songPath(playlistId, songId), { method: 'DELETE' })
}

/** Mueve la canción a `position` (0 = primera). Devuelve la playlist con el nuevo orden. */
export async function moveSongInPlaylist(playlistId: string, songId: string, position: number): Promise<PlaylistDetail> {
  const dto = await apiRequest<PlaylistDto & { songs: SongDto[] }>(songPath(playlistId, songId), { method: 'PATCH', json: { position } })
  return { ...toPlaylist(dto), songs: dto.songs.map(toSong) }
}
