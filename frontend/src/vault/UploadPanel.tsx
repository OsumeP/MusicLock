import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { Alert, SubmitButton, TextField } from '../components/ui'
import { titleFromFileName } from './mp3'
import { uploadErrorMessage } from './uploadErrors'
import { uploadSong, type UploadStage } from './uploadSong'

const STAGE_LABEL: Record<UploadStage, string> = {
  validating: 'Validando MP3…',
  encrypting: 'Cifrando en tu navegador (AES-GCM)…',
  uploading: 'Subiendo archivo cifrado…',
}

interface UploadPanelProps {
  onUploaded: (song: Song) => void
  /** Avisa cuando empieza/termina una subida (el modal no se deja cerrar mientras tanto). */
  onBusyChange?: (busy: boolean) => void
  /** id del título, para `aria-labelledby` del modal. */
  headingId?: string
  /** Dentro de un modal no se dibuja la tarjeta exterior. */
  bare?: boolean
}

/** Formulario de subida de un MP3: valida, cifra en el navegador y sube (`uploadSong`). Se usa dentro de `UploadModal`. */
export function UploadPanel({ onUploaded, onBusyChange, headingId, bare = false }: UploadPanelProps) {
  const { session, refreshUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [stage, setStage] = useState<UploadStage | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const busy = stage !== null
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])

  if (session.status !== 'ready') return null
  const { masterKey, user } = session

  function selectFile(selected: File | null) {
    setFile(selected)
    setError(null)
    if (selected) setTitle(titleFromFileName(selected.name))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setError(null)
    setProgress(0)
    try {
      const song = await uploadSong(
        file,
        { title, artist },
        {
          masterKey,
          limits: { maxFileSizeBytes: user.plan.maxFileSizeBytes, storageAvailable: user.storageAvailable },
          onStage: setStage,
          onProgress: setProgress,
        },
      )
      onUploaded(song)
      selectFile(null)
      setArtist('')
      setTitle('')
      if (inputRef.current) inputRef.current.value = ''
      await refreshUser()
    } catch (err) {
      setError(uploadErrorMessage(err))
    } finally {
      setStage(null)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-4 ${bare ? '' : 'rounded-lg bg-surface-card p-5 ring-1 ring-border-subtle'}`}
      noValidate
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="material-symbols-outlined text-primary-light">enhanced_encryption</span>
        <h2 id={headingId} className="font-display text-headline-sm font-medium">
          Subir archivo cifrado
        </h2>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border-blue bg-surface-container-lowest px-4 py-6 text-center hover:border-primary-light">
        <span aria-hidden className="material-symbols-outlined text-[32px] text-primary-light">upload_file</span>
        <span className="text-title-sm font-semibold">{file ? file.name : 'Elige un archivo MP3'}</span>
        <span className="font-mono text-mono-crypto text-on-surface-variant">
          {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB · se cifrará antes de salir de este equipo` : 'Solo MP3 · el original nunca se sube'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          className="sr-only"
          aria-label="Archivo MP3"
          disabled={busy}
          onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {file && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Título" icon="music_note" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          <TextField label="Artista" icon="person" maxLength={150} value={artist} onChange={(e) => setArtist(e.target.value)} disabled={busy} placeholder="Opcional" />
        </div>
      )}

      {stage && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="font-mono text-mono-crypto text-accent-cyan">{STAGE_LABEL[stage]}</p>
          {stage === 'uploading' && (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary-light transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      )}

      <SubmitButton icon="lock" busy={busy} busyLabel="Procesando…" disabled={!file || !title.trim()}>
        Cifrar y subir
      </SubmitButton>
    </form>
  )
}
