import { useId, useState } from 'react'

import { ApiError } from '../api/client'
import type { Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'
import { DecryptionError } from '../crypto'
import { publishOwnSong, unpublishOwnSong, type UnpublishStep } from './publishing'

const STEP_TEXT: Record<UnpublishStep, string> = {
  downloading: 'Descargando la canción cifrada…',
  encrypting: 'Cifrando de nuevo con una llave nueva…',
  uploading: 'Subiendo…',
}

function errorMessage(error: unknown, isPublic: boolean): string {
  if (error instanceof DecryptionError || (error instanceof ApiError && error.code === 'stale_key')) {
    return 'La canción cambió desde que cargaste la lista (quizá en otra pestaña). Recarga la página e inténtalo de nuevo.'
  }
  if (error instanceof ApiError) {
    if (error.code === 'shares_changed') return 'Los accesos de la canción cambiaron mientras se despublicaba. Inténtalo de nuevo.'
    return error.message
  }
  if (error instanceof TypeError) return 'Sin conexión con el servidor.'
  return isPublic ? 'No se pudo despublicar la canción. Inténtalo de nuevo.' : 'No se pudo publicar la canción. Inténtalo de nuevo.'
}

/**
 * Confirma publicar o despublicar una canción propia (D11). Despublicar rota la File
 * Key (descarga, cifra de nuevo y sube), así que muestra el paso en curso. No se
 * cierra mientras trabaja.
 */
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
  const [step, setStep] = useState<UnpublishStep | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const isPublic = song.visibility === 'public'

  if (session.status !== 'ready') return null
  const { masterKey } = session

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const saved = isPublic
        ? await unpublishOwnSong(song, masterKey, {
            onStep: (current) => {
              setStep(current)
              setProgress(null)
            },
            onProgress: setProgress,
          })
        : await publishOwnSong(song, masterKey)
      onChanged(saved)
      onClose()
    } catch (err) {
      setError(errorMessage(err, isPublic))
      setStep(null)
      setProgress(null)
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
            La canción volverá a ser privada y dejará de aparecer en Comunidad. Tu navegador la cifrará de nuevo con una llave
            nueva, así que la llave que se usó mientras era pública ya no servirá; quienes tengan acceso compartido lo
            conservan. Lo que alguien ya haya descargado no se puede recuperar.
          </Alert>
        ) : (
          <Alert tone="warning">
            Al publicar, cualquier usuario de MusicLock podrá escuchar y descargar esta canción. Dejará de ser secreta: para
            que otros puedan abrirla, el servidor guardará su llave. Puedes despublicarla cuando quieras, pero no podemos
            recuperar lo que ya se haya descargado.
          </Alert>
        )}

        {step && (
          <p className="flex items-center gap-2 font-mono text-mono-crypto text-on-surface-variant" role="status">
            <span aria-hidden className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
            {STEP_TEXT[step]}
            {step === 'uploading' && progress !== null && ` ${Math.round(progress * 100)} %`}
          </p>
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