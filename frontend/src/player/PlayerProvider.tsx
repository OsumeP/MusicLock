/**
 * Reproductor de MusicLock (Audio FR-02, Accesos FR-14, NFR Tiempo-03).
 *
 * Flujo por canción:
 *   GET /api/songs/{id}/blob (cifrado) → decryptAudio (en memoria) → Blob audio/mpeg
 *   → URL.createObjectURL → <audio>.
 *
 * El MP3 descifrado solo existe en la memoria de esta pestaña: la URL `blob:`
 * se revoca al cambiar de canción y al salir de la bóveda (logout).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { ApiError } from '../api/client'
import { downloadEncryptedSong, type Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { DecryptionError, decryptAudio } from '../crypto'
import { PlayerContext, type PlayerContextValue, type PlayerStatus } from './playerContext'

/** Al pulsar "anterior" pasados estos segundos, se reinicia la canción en lugar de retroceder. */
const RESTART_THRESHOLD_SECONDS = 3

function playbackErrorMessage(error: unknown): string {
  if (error instanceof DecryptionError) return 'No se pudo descifrar esta canción: el archivo fue alterado o la clave no coincide.'
  if (error instanceof ApiError) {
    if (error.code === 'blob_missing') return 'El archivo cifrado de esta canción no está disponible.'
    if (error.code === 'not_found') return 'La canción ya no existe.'
    if (error.code === 'storage_unavailable') return 'El almacenamiento no está disponible. Inténtalo de nuevo en unos minutos.'
  }
  if (error instanceof TypeError) return 'Sin conexión con el servidor.'
  return 'No se pudo reproducir la canción.'
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const masterKey = session.status === 'ready' ? session.masterKey : null

  const audioRef = useRef<HTMLAudioElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const loadControllerRef = useRef<AbortController | null>(null)

  const [queue, setQueue] = useState<Song[]>([])
  const [index, setIndex] = useState(-1)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)

  const releaseAudio = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const load = useCallback(
    async (song: Song) => {
      if (!masterKey) return
      loadControllerRef.current?.abort()
      const controller = new AbortController()
      loadControllerRef.current = controller

      releaseAudio()
      setStatus('loading')
      setError(null)
      setCurrentTime(0)
      setDuration(song.duration)

      try {
        const encrypted = await downloadEncryptedSong(song.id, controller.signal)
        const mp3 = await decryptAudio(encrypted, song, masterKey)
        if (controller.signal.aborted) return

        const url = URL.createObjectURL(mp3)
        objectUrlRef.current = url
        const audio = audioRef.current!
        audio.src = url
        try {
          await audio.play()
        } catch {
          // El navegador bloqueó la reproducción automática: queda en pausa, lista para ▶.
          setStatus('paused')
        }
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        setStatus('error')
        setError(playbackErrorMessage(err))
      }
    },
    [masterKey, releaseAudio],
  )

  const playAt = useCallback(
    (newQueue: Song[], newIndex: number) => {
      setQueue(newQueue)
      setIndex(newIndex)
      void load(newQueue[newIndex])
    },
    [load],
  )

  const play = useCallback(
    (song: Song, songs?: Song[]) => {
      const newQueue = songs && songs.some((s) => s.id === song.id) ? songs : [song]
      playAt(newQueue, newQueue.findIndex((s) => s.id === song.id))
    },
    [playAt],
  )

  const next = useCallback(() => {
    if (index + 1 < queue.length) playAt(queue, index + 1)
  }, [index, queue, playAt])

  const previous = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > RESTART_THRESHOLD_SECONDS) {
      audio.currentTime = 0
      return
    }
    if (index > 0) playAt(queue, index - 1)
  }, [index, queue, playAt])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !objectUrlRef.current) return
    if (audio.paused) void audio.play().catch(() => setStatus('paused'))
    else audio.pause()
  }, [])

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (audio && objectUrlRef.current) audio.currentTime = seconds
  }, [])

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value))
    if (audioRef.current) audioRef.current.volume = clamped
    setVolumeState(clamped)
  }, [])

  // Al salir de la bóveda (logout, sesión expirada): detener y liberar el audio descifrado.
  useEffect(
    () => () => {
      loadControllerRef.current?.abort()
      releaseAudio()
    },
    [releaseAudio],
  )

  const value = useMemo<PlayerContextValue>(
    () => ({
      status,
      current: queue[index] ?? null,
      queue,
      error,
      currentTime,
      duration,
      volume,
      hasNext: index >= 0 && index + 1 < queue.length,
      hasPrevious: index > 0,
      play,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
    }),
    [status, queue, index, error, currentTime, duration, volume, play, togglePlay, next, previous, seek, setVolume],
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        hidden
        onPlay={() => setStatus('playing')}
        onPause={() => setStatus((s) => (s === 'playing' ? 'paused' : s))}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setDuration(d)
        }}
        onEnded={() => {
          if (index + 1 < queue.length) next()
          else setStatus('paused')
        }}
      />
    </PlayerContext.Provider>
  )
}
