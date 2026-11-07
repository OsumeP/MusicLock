import { Link } from 'react-router'

import { Alert } from '../components/ui'
import { formatBytes } from '../lib/format'
import { usePlayer } from '../player/playerContext'
import { NoticeAlert, Pager } from '../vault/ListControls'
import { SongTable } from '../vault/SongTable'
import { useSongActions } from '../vault/useSongActions'
import { useSongList } from '../vault/useSongList'

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">{query ? 'search_off' : 'heart_plus'}</span>
      {query ? (
        <>
          <p className="text-title-md font-semibold">Ningún favorito coincide con “{query}”</p>
          <Link to="/favoritos" className="text-body-md text-primary-light hover:text-on-surface">
            Limpiar búsqueda
          </Link>
        </>
      ) : (
        <>
          <p className="text-title-md font-semibold">Aún no tienes favoritos</p>
          <p className="max-w-sm text-body-md text-on-surface-variant">
            Pulsa el corazón de una canción en “Mis Archivos” para tenerla a mano aquí.
          </p>
          <Link to="/archivos" className="mt-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">
            Ir a Mis Archivos
          </Link>
        </>
      )}
    </div>
  )
}

/** "Favoritos" (mockup musiclock_favoritos_b_veda_cifrada; Interfaz FR-02, Accesos FR-13). */
export function FavoritesPage() {
  const list = useSongList({ favorites: true })
  const { query, pageNumber, page, error, loading } = list
  const player = usePlayer()
  // Al desmarcar aquí, la canción debe salir de la lista: se recarga tras confirmar.
  const songActions = useSongActions({ onSongChanged: list.updateSong, onReload: list.reload, reloadOnFavorite: true })
  const songs = page?.songs ?? []

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="relative overflow-hidden rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle lg:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.18),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-5">
            <span aria-hidden className="relative grid size-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-container to-surface-container-lowest ring-1 ring-border-blue">
              <span className="material-symbols-outlined text-[40px] text-accent-cyan" style={{ fontVariationSettings: '"FILL" 1' }}>
                favorite
              </span>
              <span className="material-symbols-outlined absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-surface-raised text-[16px] text-primary-light ring-1 ring-border-blue">
                lock
              </span>
            </span>
            <div className="flex flex-col gap-2">
              <span className="font-mono text-mono-label uppercase tracking-wider text-accent-cyan">Tus favoritos</span>
              <h1 className="font-display text-headline-lg font-semibold">Favoritos</h1>
              {page && (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 font-mono text-mono-crypto text-on-surface-variant">
                  <span aria-hidden className="material-symbols-outlined text-[16px]">bookmark</span>
                  {page.count} {page.count === 1 ? 'pista guardada' : 'pistas guardadas'}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={songs.length === 0}
            onClick={() => player.play(songs[0], songs)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-title-sm font-semibold shadow-lg shadow-primary/20 enabled:hover:bg-primary-hover disabled:opacity-40"
          >
            <span aria-hidden className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>play_arrow</span>
            Reproducir todo
          </button>
        </div>
      </section>

      {query && (
        <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
          Favoritos que coinciden con <strong className="text-on-surface">“{query}”</strong>
          <Link to="/favoritos" className="text-primary-light hover:text-on-surface">
            · Limpiar
          </Link>
        </div>
      )}

      <NoticeAlert notice={songActions.notice} onClose={() => songActions.setNotice(null)} />

      {error && !page && (
        <Alert tone="error">
          {error}{' '}
          <button type="button" className="font-semibold underline" onClick={list.reload}>
            Reintentar
          </button>
        </Alert>
      )}

      <section className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-border-subtle" aria-busy={loading}>
        {!page && !error ? (
          <p className="px-6 py-16 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
            Cargando favoritos…
          </p>
        ) : page && songs.length === 0 ? (
          <EmptyState query={query} />
        ) : page ? (
          <SongTable
            songs={songs}
            firstIndex={list.first}
            caption="Canciones favoritas"
            dateLabel="Marcado"
            dateOf={(song) => song.favoritedAt ?? song.createdAt}
            downloadingId={songActions.downloadingId}
            favoritePending={songActions.favoritePending}
            actions={songActions.actions}
          />
        ) : null}
      </section>

      {page && page.count > 0 && (
        <Pager
          first={list.first}
          last={list.last}
          count={page.count}
          pageNumber={pageNumber}
          totalSize={formatBytes(list.totalSize)}
          hasPrevious={page.hasPrevious}
          hasNext={page.hasNext}
          onPage={list.goToPage}
        />
      )}

      {songActions.modals}
    </div>
  )
}
