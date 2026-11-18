import { useState } from 'react'
import { NavLink } from 'react-router'

import type { CommunityScope } from '../api/community'
import type { Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { Alert } from '../components/ui'
import { downloadOriginalSong } from '../vault/downloadSong'
import { SongTable } from '../vault/SongTable'
import { useSongList } from '../vault/useSongList'
import { CommentsModal } from '../comments/CommentsModal'


const NO_PENDING: ReadonlySet<string> = new Set()



const TABS = [
  { to: '/comunidad', label: 'Comunidad', end: true },
  { to: '/comunidad/mias', label: 'Mis públicas', end: false },
]

/** Comunidad (canciones públicas): "Comunidad" (de otros usuarios) y "Mis públicas". */
export function CommunityPage({ scope }: { scope: CommunityScope }) {
  const { session } = useAuth()
  const list = useSongList({ community: scope })
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [commenting, setCommenting] = useState<Song | null>(null)

  async function download(song: Song) {
    if (session.status !== 'ready') return
    setDownloadingId(song.id)
    setDownloadError(null)
    try {
      await downloadOriginalSong(song, session.masterKey)
    } catch {
      setDownloadError(`No se pudo descargar “${song.title}”.`)
    } finally {
      setDownloadingId(null)
    }
  }

  const songs = list.page?.songs ?? []
  const emptyText = list.query
    ? 'No hay canciones públicas que coincidan con tu búsqueda.'
    : scope === 'mine'
      ? 'Aún no has publicado ninguna canción. Pulsa el globo en Mis Archivos para publicar una.'
      : 'Todavía nadie ha publicado canciones.'

  /** Refresca el número de comentarios de la fila sin recargar la lista. */
  function updateCommentCount(songId: string, count: number) {
    const current = list.page?.songs.find((s) => s.id === songId)
    if (!current?.publicInfo || current.publicInfo.commentCount === count) return
    list.updateSong({ ...current, publicInfo: { ...current.publicInfo, commentCount: count } })
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-headline-lg font-semibold">Comunidad</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Canciones que los usuarios eligieron hacer públicas: cualquiera puede escucharlas y descargarlas.
        </p>
      </header>

      <nav aria-label="Vista de Comunidad" className="flex gap-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `rounded-lg px-4 py-2 text-title-sm transition ${
                isActive ? 'bg-primary-container/60 font-semibold text-white' : 'text-on-surface-variant ring-1 ring-border-subtle hover:text-on-surface'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {list.error && <Alert tone="error">{list.error}</Alert>}
      {downloadError && <Alert tone="error">{downloadError}</Alert>}

      {list.loading && !list.page && <p className="font-mono text-mono-crypto text-on-surface-variant" role="status">Cargando…</p>}

      {list.page && songs.length === 0 && <p className="text-body-md text-on-surface-variant">{emptyText}</p>}

      {songs.length > 0 && (
        <div className="rounded-xl bg-surface-card ring-1 ring-border-subtle">
          <SongTable
            songs={songs}
            firstIndex={list.first}
            caption={scope === 'mine' ? 'Mis canciones públicas' : 'Canciones públicas de la comunidad'}
            dateLabel="Publicada"
            downloadingId={downloadingId}
            favoritePending={NO_PENDING}
            actions={{ download, comments: setCommenting }}
          />
        </div>
      )}
      {commenting && (
        <CommentsModal
          song={commenting}
          onClose={() => setCommenting(null)}
          onCountChange={(count) => updateCommentCount(commenting.id, count)}
        />
      )}
      {list.page && (list.page.hasPrevious || list.page.hasNext) && (
        <div className="flex items-center justify-between font-mono text-mono-crypto text-on-surface-variant">
          <button type="button" disabled={!list.page.hasPrevious} onClick={() => list.goToPage(list.pageNumber - 1)} className="rounded-lg px-3 py-1.5 ring-1 ring-border-subtle enabled:hover:text-on-surface disabled:opacity-40">
            Anterior
          </button>
          <span>{list.first}–{list.last} de {list.page.count}</span>
          <button type="button" disabled={!list.page.hasNext} onClick={() => list.goToPage(list.pageNumber + 1)} className="rounded-lg px-3 py-1.5 ring-1 ring-border-subtle enabled:hover:text-on-surface disabled:opacity-40">
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}