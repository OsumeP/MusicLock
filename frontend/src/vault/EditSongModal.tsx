import { useId, useState, type FormEvent } from 'react'

import { ApiError } from '../api/client'
import { updateSong, type Song } from '../api/songs'
import { Modal } from '../components/Modal'
import { Alert, SubmitButton, TextField } from '../components/ui'

/** Editar título y artista (metadatos en claro, D10). El audio cifrado no cambia. */
export function EditSongModal({ song, onClose, onSaved }: { song: Song; onClose: () => void; onSaved: (song: Song) => void }) {
  const headingId = useId()
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unchanged = title.trim() === song.title && artist.trim() === song.artist

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError('El título no puede quedar vacío.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await updateSong(song.id, { title: title.trim(), artist: artist.trim() }))
      onClose()
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'La canción ya no existe.' : 'No se pudieron guardar los cambios.')
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={busy}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-primary-light">edit</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            Editar canción
          </h2>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          El título y el artista se guardan sin cifrar para poder buscarlos. El audio sigue cifrado y no se modifica.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Título" icon="music_note" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        <TextField label="Artista" icon="person" maxLength={150} value={artist} onChange={(e) => setArtist(e.target.value)} disabled={busy} placeholder="Opcional" />
        <SubmitButton icon="save" busy={busy} busyLabel="Guardando…" disabled={unchanged || !title.trim()}>
          Guardar cambios
        </SubmitButton>
      </form>
    </Modal>
  )
}
