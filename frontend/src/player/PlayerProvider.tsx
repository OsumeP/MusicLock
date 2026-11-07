/**
 * Reproductor de MusicLock (Audio FR-02, Accesos FR-14, NFR Tiempo-03).
 *
 * Flujo por canción:
 *   GET /api/songs/{id}/blob (cifrado) → decryptAudio (en memoria) → Blob audio/mpeg
 *   → URL.createObjectURL → <audio>.
 *
 * El MP3 descifrado solo existe en la memoria de esta pestaña: la URL `blob:`
 * se revoca al cambiar de canción y al salir de la bóveda (logout).
 *
 * El orden (siguiente/anterior, aleatorio, repetir) lo decide un `SongIterator`
 * (patrón Iterator, `iterators.ts`): el reproductor no sabe cómo se baraja.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { ApiError } from '../api/client'
import { recordPlay } from '../api/history'
import { downloadEncryptedSong, type Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { DecryptionError, decryptAudio } from '../crypto'
import { SongQueue, type PlaybackMode, type SongIterator } from './iterators'
import { PlayerContext, type PlayerContextValue, type PlayerStatus } from './playerContext'

/** Al pulsar "anterior" pasados estos segundos, se reinicia la canción en lugar de retroceder. */
const RESTART_THRESHOLD_SECONDS = 3

interface Cursor {
  song: Song | null
  hasNext: boolean
  hasPrevious: boolean
  /** Canciones en el orden en que sonarán (el del iterador). */
  queue: readonly Song[]
}

const EMPTY_CURSOR: Cursor = { song: null, hasNext: false, hasPrevious: false, queue: [] }

function cursorOf(iterator: SongIterator | null): Cursor {
  if (!iterator) return EMPTY_CURSOR
  return { song: iterator.current(), hasNext: iterator.hasNext(), hasPrevious: iterator.hasPrevious(), queue: iterator.traversal() }
}

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
  /** Id de la canción cuyo audio descifrado está en el <audio> (para reiniciarla sin volver a descargarla). */
  const loadedSongIdRef = useRef<string | null>(null)

  /** Cola en el orden original (la lista visible cuando se pulsó ▶). */
  const sourceRef = useRef<readonly Song[]>([])
  const iteratorRef = useRef<SongIterator | null>(null)
  const [cursor, setCursor] = useState<Cursor>(EMPTY_CURSOR)
  const [mode, setMode] = useState<PlaybackMode>({ shuffle: false, repeat: false })
  const modeRef = useRef(mode)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [historyVersion, setHistoryVersion] = useState(0)
  /** Canción cargada cuya reproducción aún no se registró (se registra al empezar a sonar). */
  const unrecordedSongRef = useRef<string | null>(null)

  /**
   * Registra la reproducción solo la primera vez que suena cada canción cargada:
   * pausar y reanudar no cuenta como otra reproducción. Si falla, no interrumpe el audio.
   */
  const handlePlaying = useCallback(() => {
    setStatus('playing')
    const songId = unrecordedSongRef.current
    if (!songId) return
    unrecordedSongRef.current = null
    recordPlay(songId)
      .then(() => setHistoryVersion((v) => v + 1))
      .catch(() => {})
  }, [])

  const releaseAudio = useCallback(() => {
    loadedSongIdRef.current = null
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
      unrecordedSongRef.current = null
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
        loadedSongIdRef.current = song.id
        unrecordedSongRef.current = song.id
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

  /** Publica el estado del iterador para la interfaz. */
  const sync = useCallback(() => setCursor(cursorOf(iteratorRef.current)), [])

  /** Hace sonar `song`: si ya es la que está en el <audio>, la reinicia (p. ej. repetir con una sola canción). */
  const start = useCallback(
    (song: Song | null) => {
      if (!song) return
      const audio = audioRef.current
      if (audio && objectUrlRef.current && loadedSongIdRef.current === song.id) {
        audio.currentTime = 0
        unrecordedSongRef.current = song.id // cada vuelta cuenta como otra reproducción
        void audio.play().catch(() => setStatus('paused'))
        return
      }
      void load(song)
    },
    [load],
  )

  const startQueue = useCallback(
    (songs: readonly Song[], startSongId: string, playbackMode: PlaybackMode) => {
      sourceRef.current = songs
      iteratorRef.current = new SongQueue(songs).createIterator(playbackMode, startSongId)
      sync()
      start(iteratorRef.current.current())
    },
    [sync, start],
  )

  const play = useCallback(
    (song: Song, songs?: Song[]) => {
      const queue = songs && songs.some((s) => s.id === song.id) ? songs : [song]
      startQueue(queue, song.id, modeRef.current)
    },
    [startQueue],
  )

  const playAll = useCallback(
    (songs: Song[], { shuffle }: { shuffle?: boolean } = {}) => {
      if (songs.length === 0) return
      const playbackMode = shuffle === undefined ? modeRef.current : { ...modeRef.current, shuffle }
      modeRef.current = playbackMode
      setMode(playbackMode)
      // En aleatorio también la primera canción es al azar.
      const first = playbackMode.shuffle ? songs[Math.floor(Math.random() * songs.length)] : songs[0]
      startQueue(songs, first.id, playbackMode)
    },
    [startQueue],
  )

  const next = useCallback(() => {
    const iterator = iteratorRef.current
    if (!iterator?.hasNext()) return
    const song = iterator.next()
    sync()
    start(song)
  }, [sync, start])

  const previous = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > RESTART_THRESHOLD_SECONDS) {
      audio.currentTime = 0
      return
    }
    const iterator = iteratorRef.current
    if (!iterator?.hasPrevious()) return
    const song = iterator.previous()
    sync()
    start(song)
  }, [sync, start])

  /** Sustituye el iterador conservando la canción actual (no interrumpe el audio). */
  const rebuild = useCallback(
    (songs: readonly Song[], playbackMode: PlaybackMode) => {
      const currentId = iteratorRef.current?.current()?.id
      if (currentId === undefined) return
      iteratorRef.current = new SongQueue(songs).createIterator(playbackMode, currentId)
      sync()
    },
    [sync],
  )

  const setShuffle = useCallback(
    (shuffle: boolean) => {
      const playbackMode = { ...modeRef.current, shuffle }
      modeRef.current = playbackMode
      setMode(playbackMode)
      // Activar: se baraja el resto a partir de la actual. Desactivar: se vuelve al orden original.
      rebuild(sourceRef.current, playbackMode)
    },
    [rebuild],
  )

  const setRepeat = useCallback(
    (repeat: boolean) => {
      const playbackMode = { ...modeRef.current, repeat }
      modeRef.current = playbackMode
      setMode(playbackMode)
      // Se conserva el orden actual (si está barajado, no se vuelve a barajar).
      const iterator = iteratorRef.current
      if (iterator) rebuild(iterator.traversal(), { shuffle: false, repeat })
    },
    [rebuild],
  )

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

  const forget = useCallback(
    (songId: string) => {
      const iterator = iteratorRef.current
      if (!iterator || !iterator.traversal().some((s) => s.id === songId)) return
      sourceRef.current = sourceRef.current.filter((s) => s.id !== songId)
      if (iterator.current()?.id === songId) {
        loadControllerRef.current?.abort()
        releaseAudio()
        setStatus('idle')
        setError(null)
        setCurrentTime(0)
        sourceRef.current = []
        iteratorRef.current = null
        sync()
        return
      }
      rebuild(
        iterator.traversal().filter((s) => s.id !== songId),
        { shuffle: false, repeat: modeRef.current.repeat },
      )
    },
    [releaseAudio, rebuild, sync],
  )

  const updateSong = useCallback(
    (song: Song) => {
      const iterator = iteratorRef.current
      if (!iterator || !iterator.traversal().some((s) => s.id === song.id)) return
      const replace = (songs: readonly Song[]) => songs.map((s) => (s.id === song.id ? song : s))
      sourceRef.current = replace(sourceRef.current)
      rebuild(replace(iterator.traversal()), { shuffle: false, repeat: modeRef.current.repeat })
    },
    [rebuild],
  )

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
      current: cursor.song,
      queue: cursor.queue,
      error,
      currentTime,
      duration,
      volume,
      hasNext: cursor.hasNext,
      hasPrevious: cursor.hasPrevious,
      shuffle: mode.shuffle,
      repeat: mode.repeat,
      play,
      playAll,
      setShuffle,
      setRepeat,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      forget,
      updateSong,
      historyVersion,
    }),
    [status, cursor, mode, error, currentTime, duration, volume, play, playAll, setShuffle, setRepeat, togglePlay, next, previous, seek, setVolume, forget, updateSong, historyVersion],
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        hidden
        onPlay={handlePlaying}
        onPause={() => setStatus((s) => (s === 'playing' ? 'paused' : s))}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setDuration(d)
        }}
        onEnded={() => {
          if (iteratorRef.current?.hasNext()) next()
          else setStatus('paused')
        }}
      />
    </PlayerContext.Provider>
  )
}
