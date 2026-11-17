import { useId, useState } from 'react'

import type { Song } from '../api/songs'
import { Modal } from '../components/Modal'
import { UploadPanel } from './UploadPanel'

/** Modal de subida. No se puede cerrar mientras una subida está en curso. */
export function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: (song: Song) => void }) {
  const headingId = useId()
  const [busy, setBusy] = useState(false)

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={busy}>
      <UploadPanel
        bare
        headingId={headingId}
        onBusyChange={setBusy}
        onUploaded={(song) => {
          onUploaded(song)
          onClose()
        }}
      />
    </Modal>
  )
}
