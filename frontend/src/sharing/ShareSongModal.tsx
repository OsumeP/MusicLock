import { useEffect, useId, useState, type FormEvent } from 'react'

import { ApiError } from '../api/client'
import { listShares, lookupRecipient, revokeShare, shareSong, type Recipient, type Share } from '../api/sharing'
import type { Song } from '../api/songs'
import { useAuth } from '../auth/session'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'
import { InvalidPublicKeyError, publicKeyFingerprint, wrapFileKeyFor } from '../crypto'
import { formatRelativeDate } from '../lib/format'

function lookupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'recipient_not_found') return 'No hay ninguna cuenta con ese correo o usuario.'
    if (error.code === 'self_share') return 'No puedes compartir contigo.'
    if (error.code === 'recipient_without_key') return 'Esa persona aún no tiene clave para compartir: debe iniciar sesión en MusicLock una vez.'
    if (error.status === 429) return 'Demasiadas búsquedas. Espera un minuto.'
  }
  if (error instanceof TypeError) return 'Sin conexión con el servidor.'
  return 'No se pudo buscar a esa persona.'
}

interface Found extends Recipient {
  fingerprint: string
}

/**
 * "Compartir" una canción propia (Accesos FR-01, FR-02, FR-05; BR-21).
 *
 * 1. Se busca al destinatario por correo o usuario exactos y se muestra la huella
 *    de su clave pública (para comprobarla por otro canal).
 * 2. En ESTE navegador se envuelve la File Key de la canción con esa clave pública
 *    (`wrapFileKeyFor`); al servidor solo llega el resultado.
 * 3. Abajo, quién tiene acceso, con "Revocar".
 */
export function ShareSongModal({ song, onClose }: { song: Song; onClose: () => void }) {
  const headingId = useId()
  const { session } = useAuth()
  const masterKey = session.status === 'ready' ? session.masterKey : null

  const [shares, setShares] = useState<Share[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [searching, setSearching] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [revoking, setRevoking] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listShares(song.id, controller.signal)
      .then(setShares)
      .catch(() => !controller.signal.aborted && setLoadFailed(true))
    return () => controller.abort()
  }, [song.id])

  async function handleLookup(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    setNotice(null)
    setFound(null)
    try {
      const recipient = await lookupRecipient(query)
      setFound({ ...recipient, fingerprint: await publicKeyFingerprint(recipient.publicKey) })
    } catch (err) {
      setError(lookupErrorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  async function handleShare() {
    if (!found || !masterKey) return
    setSharing(true)
    setError(null)
    try {
      const wrapped = await wrapFileKeyFor(song, masterKey, found.publicKey)
      const share = await shareSong(song.id, found.username, wrapped)
      setShares((current) => [share, ...(current ?? []).filter((s) => s.recipient !== share.recipient)])
      setNotice(`“${song.title}” se compartió con ${found.username}.`)
      setFound(null)
      setQuery('')
    } catch (err) {
      setError(err instanceof InvalidPublicKeyError ? 'La clave pública de esa persona no es válida.' : lookupErrorMessage(err))
    } finally {
      setSharing(false)
    }
  }

  async function handleRevoke(share: Share) {
    setRevoking((current) => new Set(current).add(share.recipient))
    setError(null)
    setNotice(null)
    try {
      await revokeShare(song.id, share.recipient)
      setShares((current) => current?.filter((s) => s.recipient !== share.recipient) ?? null)
      setNotice(`${share.recipient} ya no tiene acceso a “${song.title}”.`)
    } catch {
      setError(`No se pudo revocar el acceso de ${share.recipient}.`)
    } finally {
      setRevoking((current) => {
        const next = new Set(current)
        next.delete(share.recipient)
        return next
      })
    }
  }

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={sharing}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-primary-light">share</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            Compartir
          </h2>
        </div>
        <p className="truncate text-body-md text-on-surface-variant">
          “<span className="text-on-surface">{song.title}</span>”
        </p>

        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}

        <form onSubmit={handleLookup} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setFound(null)
            }}
            placeholder="Correo o usuario exacto"
            aria-label="Correo o usuario con quien compartir"
            autoComplete="off"
            disabled={sharing}
            className="min-w-0 flex-1 rounded-lg bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface outline-none ring-1 ring-border-subtle placeholder:text-on-surface-variant/70 focus:ring-primary-light"
          />
          <button
            type="submit"
            disabled={searching || sharing || !query.trim()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-title-sm ring-1 ring-border-subtle enabled:hover:text-on-surface disabled:opacity-40"
          >
            <span aria-hidden className={`material-symbols-outlined text-[18px] ${searching ? 'animate-spin' : ''}`}>{searching ? 'progress_activity' : 'person_search'}</span>
            Buscar
          </button>
        </form>

        {found && (
          <div className="flex flex-col gap-3 rounded-lg bg-surface-container-lowest p-4 ring-1 ring-border-blue" aria-label={`Destinatario ${found.username}`}>
            <p className="text-title-sm font-semibold text-on-surface">{found.username}</p>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-mono-label uppercase tracking-wider text-on-surface-variant">Huella de su clave</span>
              <span className="break-words font-mono text-mono-crypto text-accent-cyan">{found.fingerprint}</span>
              <span className="text-body-sm text-on-surface-variant">
                Debe coincidir con la que {found.username} ve en “Mi cuenta”. Si no coincide, no compartas.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={sharing || !masterKey}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold enabled:hover:bg-primary-hover disabled:opacity-60"
            >
              <span aria-hidden className={`material-symbols-outlined text-[18px] ${sharing ? 'animate-spin' : ''}`}>{sharing ? 'progress_activity' : 'key'}</span>
              {sharing ? 'Cifrando la clave para esta persona…' : `Compartir con ${found.username}`}
            </button>
          </div>
        )}

        <section aria-labelledby={`${headingId}-accesos`} className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <h3 id={`${headingId}-accesos`} className="text-title-sm font-semibold">
            Con acceso
          </h3>
          {loadFailed && <Alert tone="error">No se pudo cargar quién tiene acceso.</Alert>}
          {!shares && !loadFailed && (
            <p className="font-mono text-mono-crypto text-on-surface-variant" role="status">
              Cargando…
            </p>
          )}
          {shares && shares.length === 0 && <p className="text-body-md text-on-surface-variant">Solo tú.</p>}
          {shares && shares.length > 0 && (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label="Personas con acceso">
              {shares.map((share) => (
                <li key={share.recipient} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-container-high">
                  <span aria-hidden className="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-title-sm text-on-surface">{share.recipient}</span>
                    <span className="block font-mono text-mono-label text-on-surface-variant">
                      Consulta · {formatRelativeDate(share.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(share)}
                    disabled={revoking.has(share.recipient)}
                    aria-label={`Revocar el acceso de ${share.recipient}`}
                    className="rounded-lg px-3 py-1.5 text-body-sm ring-1 ring-border-subtle enabled:hover:text-security-danger disabled:opacity-40"
                  >
                    Revocar
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-body-sm text-on-surface-variant">
            “Consulta” permite reproducir y descargar, no editar ni borrar. Revocar impide que vuelva a obtener el archivo, pero
            no borra las copias que ya haya descargado.
          </p>
        </section>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={sharing} className="rounded-lg px-4 py-2 text-title-sm ring-1 ring-border-subtle hover:text-on-surface disabled:opacity-40">
            Listo
          </button>
        </div>
      </div>
    </Modal>
  )
}
