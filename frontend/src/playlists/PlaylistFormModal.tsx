import { useId, useState, type FormEvent } from 'react'

import { createPlaylist, updatePlaylist, type Playlist } from '../api/playlists'
import { Modal } from '../components/Modal'
import { Alert, SubmitButton, TextField } from '../components/ui'

/** Crear una playlist (sin `playlist`) o renombrarla / cambiar su descripción. */
export function PlaylistFormModal({
  playlist,
  onClose,
  onSaved,
}: {
  playlist?: Playlist
  onClose: () => void
  onSaved: (playlist: Playlist) => void
}) {
  const headingId = useId()
  const [name, setName] = useState(playlist?.name ?? '')
  const [description, setDescription] = useState(playlist?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = !!playlist
  const unchanged = editing && name.trim() === playlist.name && description.trim() === playlist.description

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre a la playlist.')
      return
    }
    setBusy(true)
    setError(null)
    const data = { name: name.trim(), description: description.trim() }
    try {
      onSaved(editing ? await updatePlaylist(playlist.id, data) : await createPlaylist(data))
      onClose()
    } catch {
      setError(editing ? 'No se pudieron guardar los cambios.' : 'No se pudo crear la playlist.')
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={busy}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-primary-light">{editing ? 'edit' : 'playlist_add'}</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            {editing ? 'Editar playlist' : 'Nueva playlist'}
          </h2>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          El nombre y la descripción se guardan sin cifrar, como el título de las canciones. El audio sigue cifrado.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Nombre" icon="queue_music" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        <TextField
          label="Descripción"
          icon="notes"
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          placeholder="Opcional"
        />
        <SubmitButton icon={editing ? 'save' : 'add'} busy={busy} busyLabel={editing ? 'Guardando…' : 'Creando…'} disabled={unchanged || !name.trim()}>
          {editing ? 'Guardar cambios' : 'Crear playlist'}
        </SubmitButton>
      </form>
    </Modal>
  )
}
