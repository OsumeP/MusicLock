import { apiRequest } from './client'
import { toSong, type Song, type SongDto } from './songs'

/** Una reproducción: cuándo y qué canción (con todo lo necesario para volver a reproducirla). */
export interface HistoryEntry {
  id: number
  playedAt: string
  song: Song
}

interface HistoryEntryDto {
  id: number
  played_at: string
  song: SongDto
}

export interface HistoryPage {
  count: number
  entries: HistoryEntry[]
  hasNext: boolean
  hasPrevious: boolean
}

export const HISTORY_PAGE_SIZE = 20

function toEntry(dto: HistoryEntryDto): HistoryEntry {
  return { id: dto.id, playedAt: dto.played_at, song: toSong(dto.song) }
}

/**
 * GET /api/history — reproducciones propias, la más reciente primero.
 * `distinct`: solo la última reproducción de cada canción ("Reproducido recientemente").
 */
export async function listHistory(
  { page = 1, pageSize = HISTORY_PAGE_SIZE, distinct = false }: { page?: number; pageSize?: number; distinct?: boolean } = {},
  signal?: AbortSignal,
): Promise<HistoryPage> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (distinct) params.set('distinct', '1')
  const dto = await apiRequest<{ count: number; next: string | null; previous: string | null; results: HistoryEntryDto[] }>(
    `/history?${params}`,
    { signal },
  )
  return { count: dto.count, entries: dto.results.map(toEntry), hasNext: !!dto.next, hasPrevious: !!dto.previous }
}

/** POST /api/songs/{id}/plays — registra que la canción empezó a sonar. */
export async function recordPlay(songId: string): Promise<HistoryEntry> {
  return toEntry(await apiRequest<HistoryEntryDto>(`/songs/${encodeURIComponent(songId)}/plays`, { method: 'POST' }))
}

/** DELETE /api/history — borra todo el historial del usuario (las canciones no se tocan). */
export function clearHistory(): Promise<void> {
  return apiRequest<void>('/history', { method: 'DELETE' })
}
