import { formatDuration } from '../lib/format'
import { usePlayer } from '../player/playerContext'

/** Botón de modo (aleatorio / repetir): resaltado y con `aria-pressed` cuando está activo. */
function ToggleButton({ icon, label, pressed, onClick }: { icon: string; label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={`${label}: ${pressed ? 'activado' : 'desactivado'}`}
      className={`relative hidden size-9 place-items-center rounded-full transition sm:grid ${pressed ? 'text-accent-cyan' : 'text-on-surface-variant hover:text-on-surface'}`}
    >
      <span aria-hidden className="material-symbols-outlined text-[20px]">{icon}</span>
      {pressed && <span aria-hidden className="absolute bottom-0.5 size-1 rounded-full bg-accent-cyan" />}
    </button>
  )
}

function IconButton({ icon, label, onClick, disabled, primary = false }: { icon: string; label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        primary
          ? 'grid size-11 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition enabled:hover:bg-primary-hover disabled:opacity-40'
          : 'grid size-9 place-items-center rounded-full text-on-surface-variant transition enabled:hover:text-on-surface disabled:opacity-30'
      }
    >
      <span aria-hidden className="material-symbols-outlined text-[24px]" style={primary ? { fontVariationSettings: '"FILL" 1' } : undefined}>
        {icon}
      </span>
    </button>
  )
}

/** Barra del reproductor (mockup): canción actual, controles, posición y volumen. */
export function PlayerBar() {
  const player = usePlayer()
  const { current, status, error, currentTime, duration, volume } = player
  const ready = status === 'playing' || status === 'paused'
  const total = duration || current?.duration || 0

  return (
    <footer
      aria-label="Reproductor"
      className="fixed inset-x-0 bottom-0 z-30 grid h-20 grid-cols-[1fr_auto] items-center gap-4 border-t border-border-subtle bg-surface-raised/95 px-4 backdrop-blur md:grid-cols-[1fr_2fr_1fr] lg:left-64 lg:px-8"
    >
      {/* Canción actual */}
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={`material-symbols-outlined grid size-11 shrink-0 place-items-center rounded-lg bg-surface-card ${status === 'playing' ? 'text-accent-cyan' : 'text-on-surface-variant'}`}
        >
          graphic_eq
        </span>
        <div className="min-w-0" aria-live="polite">
          {current ? (
            <>
              <p className="truncate text-title-sm font-semibold text-on-surface">{current.title}</p>
              <p className={`truncate font-mono text-mono-label ${status === 'error' ? 'text-security-danger' : 'text-on-surface-variant'}`}>
                {status === 'loading'
                  ? 'Descargando y descifrando en memoria…'
                  : status === 'error'
                    ? error
                    : `${current.artist || 'Artista desconocido'}${current.sharedBy ? ` · de ${current.sharedBy.owner}` : ''}`}
              </p>
            </>
          ) : (
            <>
              <p className="truncate text-title-sm text-on-surface-variant">Ninguna canción seleccionada</p>
              <p className="font-mono text-mono-label text-on-surface-variant/70">Pulsa ▶ en una pista de tu bóveda</p>
            </>
          )}
        </div>
      </div>

      {/* Controles y posición */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <ToggleButton icon="shuffle" label="Aleatorio" pressed={player.shuffle} onClick={() => player.setShuffle(!player.shuffle)} />
          <IconButton icon="skip_previous" label="Anterior" onClick={player.previous} disabled={!current || status === 'loading'} />
          <IconButton
            primary
            icon={status === 'loading' ? 'progress_activity' : status === 'playing' ? 'pause' : 'play_arrow'}
            label={status === 'playing' ? 'Pausar' : 'Reproducir'}
            onClick={player.togglePlay}
            disabled={!ready}
          />
          <IconButton icon="skip_next" label="Siguiente" onClick={player.next} disabled={!player.hasNext || status === 'loading'} />
          <ToggleButton icon="repeat" label="Repetir" pressed={player.repeat} onClick={() => player.setRepeat(!player.repeat)} />
        </div>
        <div className="hidden w-full max-w-xl items-center gap-3 md:flex">
          <span className="w-10 text-right font-mono text-mono-label text-on-surface-variant">{formatDuration(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(total, 1)}
            step={0.1}
            value={Math.min(currentTime, total)}
            onChange={(e) => player.seek(Number(e.target.value))}
            disabled={!ready}
            aria-label="Posición de la canción"
            aria-valuetext={`${formatDuration(currentTime)} de ${formatDuration(total)}`}
            className="h-1 flex-1 cursor-pointer accent-primary-light disabled:cursor-default disabled:opacity-40"
          />
          <span className="w-10 font-mono text-mono-label text-on-surface-variant">{formatDuration(total)}</span>
        </div>
      </div>

      {/* Estado del cifrado y volumen */}
      <div className="hidden items-center justify-end gap-4 md:flex">
        <span className="hidden items-center gap-1.5 rounded-lg border border-border-blue px-2.5 py-1 font-mono text-mono-label text-accent-cyan xl:flex">
          <span aria-hidden className="material-symbols-outlined text-[14px]">lock</span>
          RAM decrypt: AES-GCM
        </span>
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-[20px] text-on-surface-variant">
            {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            aria-label="Volumen"
            className="h-1 w-24 cursor-pointer accent-primary-light"
          />
        </div>
      </div>
    </footer>
  )
}
