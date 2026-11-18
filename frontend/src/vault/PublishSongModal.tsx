import { useId, useState } from 'react'

import { ApiError } from '../api/client'
import type { Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'
import { publishOwnSong, unpublishOwnSong } from './publishing'

/** Confirma publicar o despublicar una canción propia (D11). No se cierra mientras trabaja. */
export function PublishSongModal({
  song,
  onClose,
  onChanged,
}: {
  song: Song
  onClose: () => void
  /** Recibe la canción ya actualizada por el servidor. */
  onChanged: (song: Song) => void
}) {
  const headingId = useId()
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPublic = song.visibility === 'public'

  if (session.status !== 'ready') return null
  const { masterKey } = session

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const saved = isPublic ? await unpublishOwnSong(song) : await publishOwnSong(song, masterKey)
      onChanged(saved)
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : isPublic
            ? 'No se pudo despublicar la canción. Inténtalo de nuevo.'
            : 'No se pudo publicar la canción. Inténtalo de nuevo.',
      )
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={busy}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-primary-light">{isPublic ? 'lock' : 'public'}</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            {isPublic ? 'Dejar de publicar' : 'Publicar canción'}
          </h2>
        </div>

        <p className="text-body-md text-on-surface">“{song.title}”</p>

        {isPublic ? (
          <Alert tone="info">
            La canción volverá a ser privada y dejará de aparecer en Comunidad. Quien ya la haya descargado la conserva.
          </Alert>
        ) : (
          <Alert tone="warning">
            Al publicar, cualquier usuario de MusicLock podrá escuchar y descargar esta canción. Dejará de ser secreta: para
            que otros puedan abrirla, el servidor guardará su llave. Puedes despublicarla cuando quieras, pero no podemos
            recuperar lo que ya se haya descargado.
          </Alert>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2.5 text-title-sm ring-1 ring-border-blue hover:bg-surface-container-high disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-title-sm font-semibold text-on-surface hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden className={`material-symbols-outlined text-[18px] ${busy ? 'animate-spin' : ''}`}>
              {busy ? 'progress_activity' : isPublic ? 'lock' : 'public'}
            </span>
            {busy ? 'Procesando…' : isPublic ? 'Dejar de publicar' : 'Publicar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}