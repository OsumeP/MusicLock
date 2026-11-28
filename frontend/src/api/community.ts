import { apiBlob, apiRequest } from './client'
import { SONGS_PAGE_SIZE, type Song, type SongPage } from './songs'

/** `community`: públicas de otros usuarios. `mine`: mis propias públicas. */
export type CommunityScope = 'community' | 'following' | 'mine'


interface CommunitySongDto {
  id: string
  title: string
  artist: string
  duration: number
  size: number
  published_at: string
  file_iv: string
  public_file_key: string
  owner: string
  is_mine: boolean
  comment_count: number
  is_following: boolean
}

/** Canción pública como `Song` (sin material de la Master Key de nadie). `createdAt` es la fecha de publicación. */
export function toCommunitySong(dto: CommunitySongDto): Song {
  return {
    id: dto.id,
    title: dto.title,
    artist: dto.artist,
    duration: dto.duration,
    size: dto.size,
    createdAt: dto.published_at,
    fileIv: dto.file_iv,
    wrappedFileKey: '',
    wrappedKeyIv: '',
    isFavorite: false,
    favoritedAt: null,
    visibility: 'public',
    publishedAt: dto.published_at,
    publicInfo: {
      owner: dto.owner,
      publicFileKey: dto.public_file_key,
      isMine: dto.is_mine,
      commentCount: dto.comment_count,
      isFollowing: dto.is_following,
    },    
  }
}

/** GET /api/community/songs — la más recientemente publicada primero (`query` busca título, artista y usuario). */
export async function listCommunitySongs(
  { scope = 'community', query = '', page = 1, pageSize = SONGS_PAGE_SIZE }: { scope?: CommunityScope; query?: string; page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<SongPage> {
  const params = new URLSearchParams({ scope, page: String(page), page_size: String(pageSize) })
  if (query.trim()) params.set('q', query.trim())
  const dto = await apiRequest<{ count: number; next: string | null; previous: string | null; results: CommunitySongDto[] }>(
    `/community/songs?${params}`,
    { signal },
  )
  return { count: dto.count, songs: dto.results.map(toCommunitySong), hasNext: !!dto.next, hasPrevious: !!dto.previous }
}

/** El audio CIFRADO de una canción pública (404 si se despublicó). */
export function downloadCommunityEncryptedSong(id: string, signal?: AbortSignal): Promise<Blob> {
  return apiBlob(`/community/songs/${encodeURIComponent(id)}/blob`, { signal })
}

/** PUT / DELETE /api/community/users/{username}/follow — seguir o dejar de seguir (idempotente). Devuelve el estado final. */
export async function setFollowing(username: string, follow: boolean): Promise<boolean> {
  const dto = await apiRequest<{ username: string; is_following: boolean }>(
    `/community/users/${encodeURIComponent(username)}/follow`,
    { method: follow ? 'PUT' : 'DELETE' },
  )
  return dto.is_following
}