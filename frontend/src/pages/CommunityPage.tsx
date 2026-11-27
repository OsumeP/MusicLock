import { useState } from 'react'
import { NavLink } from 'react-router'

import { ApiError } from '../api/client'
import { setFollowing, type CommunityScope } from '../api/community'
import type { Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { CommentsModal } from '../comments/CommentsModal'
import { Alert } from '../components/ui'
import { downloadOriginalSong } from '../vault/downloadSong'
import { SongTable } from '../vault/SongTable'
import { useSongList } from '../vault/useSongList'

const NO_PENDING: ReadonlySet<string> = new Set()

/** Mensaje al fallar seguir o dejar de seguir. 429 = límite `follow` del servidor. */
function followErrorMessage(error: unknown, wanted: boolean, owner: string): string {
  if (error instanceof ApiError && error.status === 429) return 'Demasiados cambios seguidos. Espera un minuto antes de volver a intentarlo.'
  return wanted ? `No se pudo seguir a ${owner}.` : `No se pudo dejar de seguir a ${owner}.`
}

const TABS = [
  { to: '/comunidad', label: 'Comunidad', end: true },
  { to: '/comunidad/siguiendo', label: 'Siguiendo', end: false },
  { to: '/comunidad/mias', label: 'Mis públicas', end: false },
]

const EMPTY_TEXT: Record<CommunityScope, string> = {
  community: 'Todavía nadie ha publicado canciones.',
  following: 'No hay canciones de las personas que sigues. Pulsa el ícono de persona en una canción de Comunidad para seguir a su autor.',
  mine: 'Aún no has publicado ninguna canción. Pulsa el globo en Mis Archivos para publicar una.',
}

/** Comunidad (canciones públicas): "Comunidad" (de otros usuarios), "Siguiendo" y "Mis públicas". */
export function CommunityPage({ scope }: { scope: CommunityScope }) {
  const { session } = useAuth()
  const list = useSongList({ community: scope })
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [commenting, setCommenting] = useState<Song | null>(null)
  const [followPending, setFollowPending] = useState<ReadonlySet<string>>(new Set())

  async function download(song: Song) {
    if (session.status !== 'ready') return
    setDownloadingId(song.id)
    setNotice(null)
    try {
      await downloadOriginalSong(song, session.masterKey)
    } catch {
      setNotice(`No se pudo descargar “${song.title}”.`)
    } finally {
      setDownloadingId(null)
    }
  }

  /** Seguir o dejar de seguir: optimista y para todas las filas del mismo usuario; se revierte si falla. */
  async function toggleFollow(song: Song) {
    const info = song.publicInfo
    if (!info || info.isMine || followPending.has(info.owner)) return
    const owner = info.owner
    const wanted = !info.isFollowing
    const apply = (value: boolean) =>
      list.mapSongs((s) => (s.publicInfo?.owner === owner ? { ...s, publicInfo: { ...s.publicInfo, isFollowing: value } } : s))

    apply(wanted)
    setFollowPending((current) => new Set(current).add(owner))
    setNotice(null)
    try {
      await setFollowing(owner, wanted)
      if (scope === 'following' && !wanted) list.reload() // sus canciones salen de "Siguiendo"
    } catch (error) {
      apply(!wanted)
      setNotice(followErrorMessage(error, wanted, owner))
    } finally {
      setFollowPending((current) => {
        const next = new Set(current)
        next.delete(owner)
        return next
      })
    }
  }

  /** Refresca el número de comentarios de la fila sin recargar la lista. */
  function updateCommentCount(songId: string, count: number) {
    const current = list.page?.songs.find((s) => s.id === songId)
    if (!current?.publicInfo || current.publicInfo.commentCount === count) return
    list.updateSong({ ...current, publicInfo: { ...current.publicInfo, commentCount: count } })
  }

  const songs = list.page?.songs ?? []
  const emptyText = list.query ? 'No hay canciones públicas que coincidan con tu búsqueda.' : EMPTY_TEXT[scope]
  const caption = { community: 'Canciones públicas de la comunidad', following: 'Canciones públicas de quienes sigues', mine: 'Mis canciones públicas' }[scope]

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-headline-lg font-semibold">Comunidad</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Canciones que los usuarios eligieron hacer públicas: cualquiera puede escucharlas y descargarlas.
        </p>
      </header>

      <nav aria-label="Vista de Comunidad" className="flex flex-wrap gap-2">
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
      {notice && <Alert tone="error">{notice}</Alert>}

      {list.loading && !list.page && <p className="font-mono text-mono-crypto text-on-surface-variant" role="status">Cargando…</p>}

      {list.page && songs.length === 0 && <p className="text-body-md text-on-surface-variant">{emptyText}</p>}

      {songs.length > 0 && (
        <div className="rounded-xl bg-surface-card ring-1 ring-border-subtle">
          <SongTable
            songs={songs}
            firstIndex={list.first}
            caption={caption}
            dateLabel="Publicada"
            downloadingId={downloadingId}
            favoritePending={NO_PENDING}
            actions={{ download, comments: setCommenting, toggleFollow }}
          />
        </div>
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

      {commenting && (
        <CommentsModal
          song={commenting}
          onClose={() => setCommenting(null)}
          onCountChange={(count) => updateCommentCount(commenting.id, count)}
        />
      )}
    </div>
  )
}