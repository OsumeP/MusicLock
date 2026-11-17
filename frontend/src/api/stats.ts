/** Estadísticas personales (día 19; Estadísticas FR-02 a FR-05). */

import { apiRequest } from './client'
import { toSong, type Song, type SongDto } from './songs'

export type StatsPeriod = '7d' | '30d' | 'all'

export interface TopSong {
  song: Song
  plays: number
}

export interface TopArtist {
  /** "" = canciones sin artista. */
  artist: string
  plays: number
  listeningSeconds: number
  songs: number
}

export interface DailyPlays {
  /** "2026-11-06" (día de calendario en la zona horaria del servidor). */
  date: string
  plays: number
}

export interface ListeningStats {
  period: StatsPeriod
  since: string | null
  totalPlays: number
  /** Aproximado: duración completa de la canción por cada reproducción. */
  listeningSeconds: number
  distinctSongs: number
  topSongs: TopSong[]
  topArtists: TopArtist[]
  /** Vacío en "Todo el tiempo". */
  daily: DailyPlays[]
}

interface StatsDto {
  period: StatsPeriod
  since: string | null
  total_plays: number
  listening_seconds: number
  distinct_songs: number
  top_songs: { song: SongDto; plays: number }[]
  top_artists: { artist: string; plays: number; listening_seconds: number; songs: number }[]
  daily: DailyPlays[]
}

export async function getStats(period: StatsPeriod, signal?: AbortSignal): Promise<ListeningStats> {
  const dto = await apiRequest<StatsDto>(`/stats?period=${period}`, { signal })
  return {
    period: dto.period,
    since: dto.since,
    totalPlays: dto.total_plays,
    listeningSeconds: dto.listening_seconds,
    distinctSongs: dto.distinct_songs,
    topSongs: dto.top_songs.map((t) => ({ song: toSong(t.song), plays: t.plays })),
    topArtists: dto.top_artists.map((a) => ({ artist: a.artist, plays: a.plays, listeningSeconds: a.listening_seconds, songs: a.songs })),
    daily: dto.daily,
  }
}
