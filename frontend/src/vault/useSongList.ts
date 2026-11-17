import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { ApiError } from '../api/client'
import { listSharedWithMe } from '../api/sharing'
import { listSongs, SONGS_PAGE_SIZE, type Song, type SongPage } from '../api/songs'

/** Resultado de la última carga, etiquetado con la petición que lo produjo. */
type LoadResult = { key: string; page: SongPage } | { key: string; error: string }

/**
 * Lista paginada de canciones cuyo estado vive en la URL (`?q=` y `?page=`): propias
 * (opcionalmente solo favoritas) o, con `shared`, las compartidas conmigo.
 * Estilo "stale-while-revalidate": mientras llega una página nueva se sigue
 * mostrando la anterior (sin parpadeo), y no hay `setState` síncrono en efectos.
 */
export function useSongList({ favorites = false, shared = false }: { favorites?: boolean; shared?: boolean } = {}) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const pageNumber = Math.max(1, Number(params.get('page')) || 1)
  const [result, setResult] = useState<LoadResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${favorites}|${shared}|${query}|${pageNumber}|${reloadKey}`

  useEffect(() => {
    const controller = new AbortController()
    const load = shared
      ? listSharedWithMe({ query, page: pageNumber }, controller.signal)
      : listSongs({ query, page: pageNumber, favorites }, controller.signal)
    load
      .then((page) => setResult({ key: requestKey, page }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404 && pageNumber > 1) {
          setParams((p) => { p.delete('page'); return p }, { replace: true }) // la página dejó de existir
          return
        }
        setResult({ key: requestKey, error: 'No se pudo cargar tu bóveda. Inténtalo de nuevo.' })
      })
    return () => controller.abort()
  }, [favorites, shared, query, pageNumber, requestKey, setParams])

  const page = result && 'page' in result ? result.page : null
  const error = result && 'error' in result && result.key === requestKey ? result.error : null
  const loading = result?.key !== requestKey

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  /** Reemplaza una canción de la página visible sin recargar (p. ej. el favorito optimista). */
  const updateSong = useCallback((song: Song) => {
    setResult((current) =>
      current && 'page' in current
        ? { ...current, page: { ...current.page, songs: current.page.songs.map((s) => (s.id === song.id ? song : s)) } }
        : current,
    )
  }, [])

  function goToPage(target: number) {
    setParams((p) => {
      if (target <= 1) p.delete('page')
      else p.set('page', String(target))
      return p
    })
  }

  const first = page && page.count > 0 ? (pageNumber - 1) * SONGS_PAGE_SIZE + 1 : 0
  const last = page ? first + page.songs.length - 1 : 0
  const totalSize = page?.songs.reduce((sum, s) => sum + s.size, 0) ?? 0

  return { query, pageNumber, page, error, loading, reload, updateSong, goToPage, setParams, first, last, totalSize }
}
