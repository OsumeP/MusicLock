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
      <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">{query ? 'search_off' : 'folder_shared'}</span>
      {query ? (
        <>
          <p className="text-title-md font-semibold">Nada compartido contigo coincide con “{query}”</p>
          <Link to="/compartido" className="text-body-md text-primary-light hover:text-on-surface">
            Limpiar búsqueda
          </Link>
        </>
      ) : (
        <>
          <p className="text-title-md font-semibold">Nadie ha compartido canciones contigo todavía</p>
          <p className="max-w-md text-body-md text-on-surface-variant">
            Cuando alguien comparta una canción contigo aparecerá aquí. Para eso necesita tu correo o tu usuario; puede comprobar tu
            huella en “Mi cuenta”.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * "Compartido conmigo" (mockup musiclock_compartido_conmigo_acceso_cifrado;
 * Interfaz FR-04, Accesos FR-06). Rol "Consulta": reproducir y descargar.
 * El audio se descifra en este navegador con la File Key envuelta para mí.
 */
export function SharedWithMePage() {
  const list = useSongList({ shared: true })
  const { query, pageNumber, page, error, loading } = list
  const player = usePlayer()
  const songActions = useSongActions({ onSongChanged: list.updateSong, onReload: list.reload })
  const songs = page?.songs ?? []

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="relative overflow-hidden rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle lg:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.18),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-5">
            <span aria-hidden className="material-symbols-outlined grid size-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-container to-surface-container-lowest text-[40px] text-accent-cyan ring-1 ring-border-blue">
              folder_shared
            </span>
            <div className="flex flex-col gap-2">
              <span className="font-mono text-mono-label uppercase tracking-wider text-accent-cyan">Acceso cifrado · Consulta</span>
              <h1 className="font-display text-headline-lg font-semibold">Compartido conmigo</h1>
              <p className="max-w-xl text-body-md text-on-surface-variant">
                Cada canción llega con su clave cifrada para ti: solo tu navegador la abre. Puedes reproducirlas y descargarlas; no
                ocupan tu cuota.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={songs.length === 0}
            onClick={() => player.playAll(songs)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-title-sm font-semibold shadow-lg shadow-primary/20 enabled:hover:bg-primary-hover disabled:opacity-40"
          >
            <span aria-hidden className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>play_arrow</span>
            Reproducir todo
          </button>
        </div>
      </section>

      {query && (
        <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
          Compartidas que coinciden con <strong className="text-on-surface">“{query}”</strong>
          <Link to="/compartido" className="text-primary-light hover:text-on-surface">
            · Limpiar
          </Link>
        </div>
      )}

      <NoticeAlert notice={songActions.notice} onClose={() => songActions.setNotice(null)} />

      {error && !page && (
        <Alert tone="error">
          No se pudo cargar lo compartido contigo.{' '}
          <button type="button" className="font-semibold underline" onClick={list.reload}>
            Reintentar
          </button>
        </Alert>
      )}

      <section className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-border-subtle" aria-busy={loading}>
        {!page && !error ? (
          <p className="px-6 py-16 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
            Cargando…
          </p>
        ) : page && songs.length === 0 ? (
          <EmptyState query={query} />
        ) : page ? (
          <SongTable
            songs={songs}
            firstIndex={list.first}
            caption="Canciones compartidas conmigo"
            dateLabel="Compartida"
            dateOf={(song) => song.sharedBy?.sharedAt ?? song.createdAt}
            downloadingId={songActions.downloadingId}
            favoritePending={songActions.favoritePending}
            // Rol "Consulta": solo descargar (y reproducir). Sin favoritos, playlists, compartir, editar ni borrar.
            actions={{ download: songActions.actions.download }}
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
