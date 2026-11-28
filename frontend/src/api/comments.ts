import { apiRequest } from './client'

export const MAX_COMMENT_LENGTH = 1000
/** Igual que `MAX_DEPTH` del backend: una respuesta a un comentario de este nivel se rechaza. */
export const MAX_COMMENT_DEPTH = 4

export interface Comment {
  id: number
  parentId: number | null
  depth: number
  /** Null si el comentario fue eliminado (se conserva solo para no romper el hilo). */
  author: string | null
  body: string
  createdAt: string
  editedAt: string | null
  isDeleted: boolean
  /** Lo escribió el dueño de la canción. */
  bySongOwner: boolean
  isMine: boolean
  canEdit: boolean
  canDelete: boolean
}

interface CommentDto {
  id: number
  parent: number | null
  depth: number
  author: string | null
  body: string
  created_at: string
  edited_at: string | null
  is_deleted: boolean
  by_song_owner: boolean
  is_mine: boolean
  can_edit: boolean
  can_delete: boolean
}

function toComment(dto: CommentDto): Comment {
  return {
    id: dto.id,
    parentId: dto.parent,
    depth: dto.depth,
    author: dto.author,
    body: dto.body,
    createdAt: dto.created_at,
    editedAt: dto.edited_at,
    isDeleted: dto.is_deleted,
    bySongOwner: dto.by_song_owner,
    isMine: dto.is_mine,
    canEdit: dto.can_edit,
    canDelete: dto.can_delete,
  }
}

const songPath = (songId: string) => `/community/songs/${encodeURIComponent(songId)}/comments`
const commentPath = (id: number) => `/community/comments/${id}`

/** GET — todos los comentarios de una canción pública, en orden cronológico (lista plana). 404 si ya no es pública. */
export async function listComments(songId: string, signal?: AbortSignal): Promise<Comment[]> {
  return (await apiRequest<CommentDto[]>(songPath(songId), { signal })).map(toComment)
}

/** POST — comentario nuevo, o respuesta si se indica `parentId`. */
export async function createComment(songId: string, body: string, parentId?: number): Promise<Comment> {
  const json = parentId === undefined ? { body } : { body, parent: parentId }
  return toComment(await apiRequest<CommentDto>(songPath(songId), { method: 'POST', json }))
}

/** PATCH — solo el autor. */
export async function editComment(id: number, body: string): Promise<Comment> {
  return toComment(await apiRequest<CommentDto>(commentPath(id), { method: 'PATCH', json: { body } }))
}

/** DELETE — el autor o el dueño de la canción. Con respuestas, queda como "eliminado". */
export function deleteComment(id: number): Promise<void> {
  return apiRequest<void>(commentPath(id), { method: 'DELETE' })
}