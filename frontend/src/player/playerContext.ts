import { createContext, useContext } from 'react'

import type { Song } from '../api/songs'

/**
 * - idle:    nada cargado.
 * - loading: descargando el cifrado y descifrándolo en memoria.
 * - playing / paused: audio descifrado listo en el <audio>.
 * - error:   no se pudo descargar o descifrar (ver `error`).
 */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PlayerContextValue {
  status: PlayerStatus
  /** Canción actual (cargada o cargándose). */
  current: Song | null
  /** Cola de reproducción (la lista visible cuando se pulsó ▶). */
  queue: Song[]
  error: string | null
  currentTime: number
  duration: number
  volume: number
  hasNext: boolean
  hasPrevious: boolean
  /** Reproduce `song`; `queue` define qué suena con anterior/siguiente. */
  play(song: Song, queue?: Song[]): void
  togglePlay(): void
  next(): void
  previous(): void
  seek(seconds: number): void
  setVolume(volume: number): void
}

export const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext)
  if (!value) throw new Error('usePlayer debe usarse dentro de <PlayerProvider>')
  return value
}
