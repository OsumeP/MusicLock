import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { ApiError } from '../api/client'
import { listSongs, SONGS_PAGE_SIZE, type Song, type SongPage } from '../api/songs'
import { Alert } from '../components/ui'
import { formatBytes, formatDuration, formatRelativeDate } from '../lib/format'
import { UploadModal } from '../vault/UploadModal'

/** Resultado de la última carga, etiquetado con la petición que lo produjo. */
type LoadResult = { key: string; page: SongPage } | { key: string; error: string }

function SongRow({ song, index }: { song: Song; index: number }) {
  return (
    <tr className="border-t border-border-subtle/60 transition-colors hover:bg-surface-container-high/40">
      <td className="px-4 py-3 text-center font-mono text-mono-crypto text-on-surface-variant">{index}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="material-symbols-outlined grid size-10 shrink-0 place-items-center rounded-lg bg-surface-container-lowest text-primary-light">
            graphic_eq
          </span>
          <div className="min-w-0">
            <p className="truncate text-title-sm font-semibold text-on-surface">{song.title}</p>
            <p className="truncate font-mono text-mono-label text-on-surface-variant" title={song.id}>
              ID {song.id.slice(0, 8)}…{song.id.slice(-4)}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 text-body-md text-on-surface md:table-cell">
        {song.artist || <span className="text-on-surface-variant">—</span>}
      </td>
      <td className="hidden px-4 py-3 text-right font-mono text-mono-crypto text-on-surface sm:table-cell">{formatDuration(song.duration)}</td>
      <td className="hidden px-4 py-3 text-right font-mono text-mono-crypto text-on-surface lg:table-cell">{formatBytes(song.size)}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-2.5 py-1 font-mono text-mono-label text-primary-light">
          <span aria-hidden className="material-symbols-outlined text-[12px]">lock</span>
          AES-GCM 256
        </span>
      </td>
      <td className="hidden px-4 py-3 text-right font-mono text-mono-crypto text-on-surface-variant xl:table-cell">
        <time dateTime={song.createdAt}>{formatRelativeDate(song.createdAt)}</time>
      </td>
    </tr>
  )
}

function EmptyState({ query, onUpload }: { query: string; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">{query ? 'search_off' : 'library_music'}</span>
      {query ? (
        <>
          <p className="text-title-md font-semibold">Sin resultados para “{query}”</p>
          <Link to="/archivos" className="text-body-md text-primary-light hover:text-on-surface">
            Limpiar búsqueda
          </Link>
        </>
      ) : (
        <>
          <p className="text-title-md font-semibold">Tu bóveda está vacía</p>
          <p className="max-w-sm text-body-md text-on-surface-variant">
            Sube tu primer MP3: se cifra en este navegador antes de salir y solo tú puedes escucharlo.
          </p>
          <button type="button" onClick={onUpload} className="mt-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">
            Subir archivo cifrado
          </button>
        </>
      )}
    </div>
  )
}

/** "Mis Archivos" (mockup musiclock_mis_archivos_b_veda_cifrada). */
export function MyFilesPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const pageNumber = Math.max(1, Number(params.get('page')) || 1)
  const [result, setResult] = useState<LoadResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [uploadOpen, setUploadOpen] = useState(false)
  const requestKey = `${query}|${pageNumber}|${reloadKey}`

  useEffect(() => {
    const controller = new AbortController()
    listSongs({ query, page: pageNumber }, controller.signal)
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
  }, [query, pageNumber, requestKey, setParams])

  // Mientras llega la respuesta nueva se sigue mostrando la anterior (sin parpadeo).
  const page = result && 'page' in result ? result.page : null
  const error = result && 'error' in result && result.key === requestKey ? result.error : null
  const loading = result?.key !== requestKey
  const state = { kind: page ? 'loaded' : error ? 'error' : 'loading', message: error } as const

  function goToPage(page: number) {
    setParams((p) => {
      if (page <= 1) p.delete('page')
      else p.set('page', String(page))
      return p
    })
  }

  const first = page && page.count > 0 ? (pageNumber - 1) * SONGS_PAGE_SIZE + 1 : 0
  const last = page ? first + page.songs.length - 1 : 0
  const totalSize = page?.songs.reduce((sum, s) => sum + s.size, 0) ?? 0

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-blue px-2.5 py-0.5 font-mono text-mono-label uppercase text-accent-cyan">
            <span className="size-1.5 rounded-full bg-accent-cyan" />
            Cifrado cero-conocimiento activo
          </span>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-headline-md font-semibold">
            Mis Archivos
            {page && (
              <span className="rounded-md bg-surface-card px-2 py-0.5 font-mono text-mono-crypto font-normal text-on-surface-variant">
                {page.count} {page.count === 1 ? 'elemento' : 'elementos'}
              </span>
            )}
          </h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Tus pistas se cifran con <strong className="font-semibold text-on-surface">AES-GCM (256 bits)</strong> en este navegador y solo se
            descifran en tu memoria local. El servidor guarda bytes que no puede leer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-title-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary-hover"
        >
          <span aria-hidden className="material-symbols-outlined">enhanced_encryption</span>
          Subir archivo cifrado
        </button>
      </div>

      {query && (
        <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
          Resultados para <strong className="text-on-surface">“{query}”</strong>
          <Link to="/archivos" className="text-primary-light hover:text-on-surface">
            · Limpiar
          </Link>
        </div>
      )}

      {state.kind === 'error' && (
        <Alert tone="error">
          {state.message}{' '}
          <button type="button" className="font-semibold underline" onClick={() => setReloadKey((k) => k + 1)}>
            Reintentar
          </button>
        </Alert>
      )}

      <section className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-border-subtle" aria-busy={loading}>
        {state.kind === 'loading' ? (
          <p className="px-6 py-16 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
            Cargando bóveda…
          </p>
        ) : page && page.songs.length === 0 ? (
          <EmptyState query={query} onUpload={() => setUploadOpen(true)} />
        ) : page ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Archivos cifrados</caption>
              <thead>
                <tr className="font-mono text-mono-label uppercase tracking-wider text-on-surface-variant">
                  <th scope="col" className="w-12 px-4 py-3 text-center font-medium">#</th>
                  <th scope="col" className="px-4 py-3 font-medium">Título / pista</th>
                  <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Artista</th>
                  <th scope="col" className="hidden px-4 py-3 text-right font-medium sm:table-cell">Duración</th>
                  <th scope="col" className="hidden px-4 py-3 text-right font-medium lg:table-cell">Tamaño</th>
                  <th scope="col" className="px-4 py-3 font-medium">Cifrado</th>
                  <th scope="col" className="hidden px-4 py-3 text-right font-medium xl:table-cell">Subido</th>
                </tr>
              </thead>
              <tbody>
                {page.songs.map((song, i) => (
                  <SongRow key={song.id} song={song} index={first + i} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {page && page.count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-mono-crypto text-on-surface-variant">
          <span>
            Mostrando {first}–{last} de {page.count} · {formatBytes(totalSize)} en esta página
          </span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={!page.hasPrevious} onClick={() => goToPage(pageNumber - 1)} className="rounded-lg px-3 py-1.5 ring-1 ring-border-subtle enabled:hover:text-on-surface disabled:opacity-40">
              Anterior
            </button>
            <span className="text-on-surface">{pageNumber}</span>
            <button type="button" disabled={!page.hasNext} onClick={() => goToPage(pageNumber + 1)} className="rounded-lg px-3 py-1.5 ring-1 ring-border-subtle enabled:hover:text-on-surface disabled:opacity-40">
              Siguiente
            </button>
          </div>
        </div>
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            if (pageNumber !== 1 || query) setParams({}) // volver a la primera página para ver la canción nueva
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
