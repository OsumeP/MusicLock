import type { ReactNode } from 'react'

import type { Song } from '../api/songs'
import { formatBytes, formatDuration, formatRelativeDate } from '../lib/format'
import { usePlayer } from '../player/playerContext'

/** Acciones de cada fila. Las opcionales que no se pasen no muestran su botón. */
export interface RowActions {
  toggleFavorite(song: Song): void
  download(song: Song): void
  addToPlaylist?(song: Song): void
  edit?(song: Song): void
  remove?(song: Song): void
}

function RowAction({
  icon,
  label,
  onClick,
  disabled,
  danger,
  spinning,
  pressed,
  filled,
  className = '',
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  spinning?: boolean
  pressed?: boolean
  filled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`grid size-8 place-items-center rounded-lg transition disabled:opacity-60 ${
        danger ? 'text-on-surface-variant hover:bg-security-danger/15 hover:text-security-danger' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      } ${className}`}
    >
      <span
        aria-hidden
        className={`material-symbols-outlined text-[20px] ${spinning ? 'animate-spin' : ''}`}
        style={filled ? { fontVariationSettings: '"FILL" 1' } : undefined}
      >
        {icon}
      </span>
    </button>
  )
}

function SongRow({
  song,
  index,
  queue,
  downloading,
  favoritePending,
  date,
  actions,
  extras,
}: {
  song: Song
  index: number
  queue: Song[]
  downloading: boolean
  favoritePending: boolean
  date: string
  actions: RowActions
  extras?: ReactNode
}) {
  const player = usePlayer()
  const isCurrent = player.current?.id === song.id
  const isPlaying = isCurrent && player.status === 'playing'
  const isLoading = isCurrent && player.status === 'loading'
  const inMemory = isCurrent && (player.status === 'playing' || player.status === 'paused')

  function handleClick() {
    if (isCurrent && (player.status === 'playing' || player.status === 'paused')) player.togglePlay()
    else player.play(song, queue)
  }

  return (
    <tr
      aria-current={isCurrent ? 'true' : undefined}
      className={`group border-t border-border-subtle/60 transition-colors ${isCurrent ? 'bg-primary-container/30' : 'hover:bg-surface-container-high/40'}`}
    >
      <td className="px-2 py-3 text-center sm:px-4">
        <button
          type="button"
          onClick={handleClick}
          aria-label={`${isPlaying ? 'Pausar' : 'Reproducir'} ${song.title}`}
          className={`grid size-8 place-items-center rounded-lg font-mono text-mono-crypto transition ${
            isCurrent ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-primary hover:text-white'
          }`}
        >
          {isCurrent ? (
            <span aria-hidden className={`material-symbols-outlined text-[20px] ${isLoading ? 'animate-spin' : ''}`}>
              {isLoading ? 'progress_activity' : isPlaying ? 'pause' : 'play_arrow'}
            </span>
          ) : (
            <>
              <span className="group-hover:hidden">{index}</span>
              <span aria-hidden className="material-symbols-outlined hidden text-[20px] group-hover:block">play_arrow</span>
            </>
          )}
        </button>
      </td>
      <td className="px-2 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`material-symbols-outlined hidden size-10 shrink-0 sm:grid place-items-center rounded-lg bg-surface-container-lowest ${isPlaying ? 'animate-pulse text-accent-cyan' : 'text-primary-light'}`}
          >
            graphic_eq
          </span>
          <div className="min-w-0">
            <p className="flex max-w-[10rem] items-center gap-2 truncate text-title-sm font-semibold text-on-surface sm:max-w-xs">
              {song.title}
              {inMemory && (
                <span className="rounded bg-primary-container px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent-cyan" title="Descifrada solo en la memoria de este navegador">
                  En RAM
                </span>
              )}
            </p>
            <p className="max-w-[10rem] truncate font-mono sm:max-w-xs text-mono-label text-on-surface-variant" title={song.id}>
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
      <td className="hidden px-4 py-3 md:table-cell">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-2.5 py-1 font-mono text-mono-label text-primary-light">
          <span aria-hidden className="material-symbols-outlined text-[12px]">lock</span>
          AES-GCM 256
        </span>
      </td>
      <td className="hidden px-4 py-3 text-right font-mono text-mono-crypto text-on-surface-variant xl:table-cell">
        <time dateTime={date} title={new Date(date).toLocaleString('es-CO')}>{formatRelativeDate(date)}</time>
      </td>
      <td className="px-2 py-3">
        <div className="flex justify-end gap-1">
          {extras}
          <RowAction
            icon="favorite"
            filled={song.isFavorite}
            pressed={song.isFavorite}
            label={song.isFavorite ? `Quitar ${song.title} de favoritos` : `Añadir ${song.title} a favoritos`}
            onClick={() => actions.toggleFavorite(song)}
            disabled={favoritePending}
            className={song.isFavorite ? '!text-accent-cyan' : ''}
          />
          {actions.addToPlaylist && (
            <RowAction icon="playlist_add" label={`Añadir ${song.title} a una playlist`} onClick={() => actions.addToPlaylist?.(song)} />
          )}
          {/* En móvil se ocultan descargar y editar para que la fila quepa a 390 px. */}
          <RowAction
            icon={downloading ? 'progress_activity' : 'download'}
            spinning={downloading}
            label={`Descargar ${song.title}`}
            onClick={() => actions.download(song)}
            disabled={downloading}
            className="hidden sm:grid"
          />
          {actions.edit && <RowAction icon="edit" label={`Editar ${song.title}`} onClick={() => actions.edit?.(song)} className="hidden sm:grid" />}
          {actions.remove && <RowAction icon="delete" label={`Eliminar ${song.title}`} onClick={() => actions.remove?.(song)} danger />}
        </div>
      </td>
    </tr>
  )
}

/**
 * Tabla de canciones cifradas (mockups "Mis Archivos", "Favoritos" y "Recientes").
 * ▶ en una fila reproduce esa canción con `queue` (por defecto, `songs`) como cola.
 *
 * - `dateLabel` / `dateOf`: qué fecha muestra la última columna (por defecto, la de subida).
 * - `rowKey`: necesario cuando una canción puede repetirse (historial de reproducción).
 * - `rowExtras`: botones adicionales al inicio de las acciones (p. ej. mover / quitar de una playlist).
 */
export function SongTable({
  songs,
  firstIndex,
  caption,
  queue = songs,
  dateLabel = 'Subido',
  dateOf = (song) => song.createdAt,
  rowKey = (song) => song.id,
  downloadingId,
  favoritePending,
  actions,
  rowExtras,
}: {
  songs: Song[]
  firstIndex: number
  caption: string
  queue?: Song[]
  dateLabel?: string
  dateOf?: (song: Song, index: number) => string
  rowKey?: (song: Song, index: number) => string
  downloadingId: string | null
  favoritePending: ReadonlySet<string>
  actions: RowActions
  rowExtras?: (song: Song, index: number) => ReactNode
}) {
  return (
    <div className="relative overflow-x-auto">
      {/* `relative`: contiene los elementos sr-only (position: absolute) de la tabla;
          sin esto escapan del scroll y desbordan toda la página en móvil. */}
      <table className="w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="font-mono text-mono-label uppercase tracking-wider text-on-surface-variant">
            <th scope="col" className="w-12 px-2 py-3 text-center font-medium sm:px-4">#</th>
            <th scope="col" className="px-2 py-3 font-medium sm:px-4">Título / pista</th>
            <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Artista</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-medium sm:table-cell">Duración</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-medium lg:table-cell">Tamaño</th>
            <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Cifrado</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-medium xl:table-cell">
              {dateLabel}
            </th>
            <th scope="col" className="px-2 py-3 text-right font-medium">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {songs.map((song, i) => (
            <SongRow
              key={rowKey(song, i)}
              song={song}
              index={firstIndex + i}
              queue={queue}
              downloading={downloadingId === song.id}
              favoritePending={favoritePending.has(song.id)}
              date={dateOf(song, i)}
              actions={actions}
              extras={rowExtras?.(song, i)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
