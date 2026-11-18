import { useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  createComment,
  deleteComment,
  editComment,
  listComments,
  MAX_COMMENT_DEPTH,
  MAX_COMMENT_LENGTH,
  type Comment,
} from '../api/comments'
import type { Song } from '../api/songs'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'
import { formatRelativeDate } from '../lib/format'
import { buildCommentTree, countVisibleComments, type CommentNode } from './tree'

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'max_depth') return 'Esta conversación llegó al máximo de niveles de respuesta.'
    if (error.code === 'owner_cannot_comment' || error.code === 'forbidden') return error.message
    if (error.status === 404) return 'El comentario o la canción ya no existe. Se actualizó la lista.'
    if (error.status === 400) return error.fieldErrors.body?.[0] ?? fallback
    if (error.status === 429) return 'Demasiados comentarios seguidos. Espera un momento.'
  }
  if (error instanceof TypeError) return 'Sin conexión con el servidor.'
  return fallback
}

/** Caja de texto para comentar, responder o editar. `onSubmit` devuelve true si se guardó. */
function Composer({
  label,
  placeholder,
  submitLabel,
  initial = '',
  busy,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  label: string
  placeholder: string
  submitLabel: string
  initial?: string
  busy: boolean
  autoFocus?: boolean
  onSubmit: (body: string) => Promise<boolean>
  onCancel?: () => void
}) {
  const [body, setBody] = useState(initial)
  const text = body.trim()

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        if (text && (await onSubmit(text))) setBody('')
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        maxLength={MAX_COMMENT_LENGTH}
        rows={2}
        autoFocus={autoFocus}
        disabled={busy}
        className="w-full resize-y rounded-lg bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface outline-none ring-1 ring-border-subtle placeholder:text-on-surface-variant/70 focus:ring-primary-light"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-mono-label text-on-surface-variant">{body.length}/{MAX_COMMENT_LENGTH}</span>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-3 py-1.5 text-body-sm ring-1 ring-border-subtle hover:text-on-surface disabled:opacity-40">
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !text || (initial !== '' && text === initial)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-body-sm font-semibold enabled:hover:bg-primary-hover disabled:opacity-60"
          >
            <span aria-hidden className={`material-symbols-outlined text-[16px] ${busy ? 'animate-spin' : ''}`}>{busy ? 'progress_activity' : 'send'}</span>
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}

const linkButton = 'rounded px-1.5 py-0.5 text-body-sm text-on-surface-variant hover:text-on-surface disabled:opacity-40'

interface ItemActions {
  replyingTo: number | null
  editing: number | null
  busy: boolean
  removing: ReadonlySet<number>
  startReply(id: number | null): void
  startEdit(id: number | null): void
  submitReply(parent: Comment, body: string): Promise<boolean>
  submitEdit(comment: Comment, body: string): Promise<boolean>
  remove(comment: Comment): void
}

/** Un comentario y, debajo, sus respuestas: el componente se llama a sí mismo (Composite). */
function CommentItem({ node, actions }: { node: CommentNode; actions: ItemActions }) {
  const { comment, replies } = node
  const canReply = !comment.isDeleted && comment.depth < MAX_COMMENT_DEPTH

  return (
    <li className="flex flex-col gap-2">
      <div className="rounded-lg bg-surface-container-lowest px-3 py-2.5 ring-1 ring-border-subtle">
        {comment.isDeleted ? (
          <p className="text-body-md italic text-on-surface-variant">[comentario eliminado]</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-title-sm font-semibold text-on-surface">{comment.author}</span>
              {comment.bySongOwner && (
                <span className="rounded bg-accent-cyan/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent-cyan">Autor</span>
              )}
              {comment.isMine && (
                <span className="rounded bg-primary-container px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary-light">Tú</span>
              )}
              <time dateTime={comment.createdAt} className="font-mono text-mono-label text-on-surface-variant">
                {formatRelativeDate(comment.createdAt)}
                {comment.editedAt && ' · editado'}
              </time>
            </div>
            {actions.editing === comment.id ? (
              <div className="mt-2">
                <Composer
                  label="Editar comentario"
                  placeholder=""
                  submitLabel="Guardar"
                  initial={comment.body}
                  busy={actions.busy}
                  autoFocus
                  onSubmit={(body) => actions.submitEdit(comment, body)}
                  onCancel={() => actions.startEdit(null)}
                />
              </div>
            ) : (
              <p className="mt-1 whitespace-pre-wrap break-words text-body-md text-on-surface">{comment.body}</p>
            )}
          </>
        )}

        {!comment.isDeleted && actions.editing !== comment.id && (
          <div className="mt-1 flex flex-wrap gap-1">
            {canReply && (
              <button type="button" className={linkButton} onClick={() => actions.startReply(actions.replyingTo === comment.id ? null : comment.id)}>
                Responder
              </button>
            )}
            {comment.canEdit && (
              <button type="button" className={linkButton} onClick={() => actions.startEdit(comment.id)}>
                Editar
              </button>
            )}
            {comment.canDelete && (
              <button
                type="button"
                className={`${linkButton} hover:!text-security-danger`}
                disabled={actions.removing.has(comment.id)}
                onClick={() => actions.remove(comment)}
                aria-label={`Eliminar el comentario de ${comment.author}`}
              >
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>

      {actions.replyingTo === comment.id && (
        <div className="ml-4 sm:ml-6">
          <Composer
            label={`Responder a ${comment.author}`}
            placeholder={`Responder a ${comment.author}…`}
            submitLabel="Responder"
            busy={actions.busy}
            autoFocus
            onSubmit={(body) => actions.submitReply(comment, body)}
            onCancel={() => actions.startReply(null)}
          />
        </div>
      )}

      {replies.length > 0 && (
        <ul className="ml-3 flex flex-col gap-2 border-l border-border-subtle pl-3 sm:ml-5 sm:pl-4">
          {replies.map((reply) => (
            <CommentItem key={reply.comment.id} node={reply} actions={actions} />
          ))}
        </ul>
      )}
    </li>
  )
}

  /**
   * Comentarios de una canción pública. En Comunidad se puede comentar y responder; en
   * tus propias públicas se ven, se responden y se eliminan, pero no se abren hilos nuevos.
   */
  export function CommentsModal({
    song,
    onClose,
    onCountChange,
  }: {
    song: Song
    onClose: () => void
    /** Se llama con el total de comentarios visibles cuando se carga la lista y cada vez que cambia. */
    onCountChange?: (count: number) => void
  }) {
  const headingId = useId()
  const isOwner = song.publicInfo?.isMine ?? false
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [replyingTo, setReplyingTo] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    const controller = new AbortController()
    listComments(song.id, controller.signal)
      .then((list) => {
        setComments(list)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(err instanceof ApiError && err.status === 404 ? 'Esta canción ya no es pública.' : 'No se pudieron cargar los comentarios.')
      })
    return () => controller.abort()
  }, [song.id, reloadKey])

  const reload = () => setReloadKey((k) => k + 1)

  /** Ejecuta una escritura: gestiona el estado de ocupado y el error. Devuelve true si salió bien. */
  async function write(run: () => Promise<void>, fallback: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await run()
      return true
    } catch (err) {
      setError(errorMessage(err, fallback))
      if (err instanceof ApiError && err.status === 404) reload()
      return false
    } finally {
      setBusy(false)
    }
  }

  const submitNew = (body: string) =>
    write(async () => {
      const created = await createComment(song.id, body)
      setComments((current) => [...(current ?? []), created])
    }, 'No se pudo publicar el comentario.')

  const actions: ItemActions = {
    replyingTo,
    editing,
    busy,
    removing,
    startReply: (id) => {
      setReplyingTo(id)
      setEditing(null)
    },
    startEdit: (id) => {
      setEditing(id)
      setReplyingTo(null)
    },
    submitReply: (parent, body) =>
      write(async () => {
        const created = await createComment(song.id, body, parent.id)
        setComments((current) => [...(current ?? []), created])
        setReplyingTo(null)
      }, 'No se pudo publicar la respuesta.'),
    submitEdit: (comment, body) =>
      write(async () => {
        const saved = await editComment(comment.id, body)
        setComments((current) => current?.map((c) => (c.id === saved.id ? saved : c)) ?? null)
        setEditing(null)
      }, 'No se pudo guardar el cambio.'),
    remove: (comment) => {
      setRemoving((current) => new Set(current).add(comment.id))
      setError(null)
      deleteComment(comment.id)
        .then(reload) // el servidor decide si queda como "eliminado" o se borra: se vuelve a pedir la lista
        .catch((err: unknown) => setError(errorMessage(err, 'No se pudo eliminar el comentario.')))
        .finally(() =>
          setRemoving((current) => {
            const next = new Set(current)
            next.delete(comment.id)
            return next
          }),
        )
    },
  }

  const tree = comments ? buildCommentTree(comments) : []
  const total = comments ? countVisibleComments(comments) : 0
  // Se guarda la última función recibida para que el efecto dependa solo del total
  // (si dependiera de la función, cada render del padre volvería a dispararlo).
  const onCountChangeRef = useRef(onCountChange)
  useEffect(() => {
    onCountChangeRef.current = onCountChange
  })
  const loaded = comments !== null
  useEffect(() => {
    if (loaded) onCountChangeRef.current?.(total)
  }, [loaded, total])

  return (
    <Modal labelledBy={headingId} onClose={onClose} locked={busy}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-primary-light">forum</span>
          <h2 id={headingId} className="font-display text-headline-sm font-medium">
            Comentarios
          </h2>
          {comments && <span className="font-mono text-mono-crypto text-on-surface-variant">({total})</span>}
        </div>
        <p className="truncate text-body-md text-on-surface-variant">
          “<span className="text-on-surface">{song.title}</span>”
          {song.publicInfo && !isOwner && <span> · de {song.publicInfo.owner}</span>}
        </p>

        {error && <Alert tone="error">{error}</Alert>}

        {isOwner ? (
          <Alert tone="info">Es tu canción: aquí puedes ver los comentarios, responderlos y eliminarlos.</Alert>
        ) : (
          !loadError && (
            <Composer label="Escribir un comentario" placeholder="Escribe un comentario…" submitLabel="Comentar" busy={busy} onSubmit={submitNew} />
          )
        )}

        {loadError && <Alert tone="error">{loadError}</Alert>}
        {!comments && !loadError && (
          <p className="font-mono text-mono-crypto text-on-surface-variant" role="status">
            Cargando…
          </p>
        )}
        {comments && tree.length === 0 && <p className="text-body-md text-on-surface-variant">Aún no hay comentarios.</p>}

        {tree.length > 0 && (
          <ul aria-label="Comentarios" className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
            {tree.map((node) => (
              <CommentItem key={node.comment.id} node={node} actions={actions} />
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-title-sm ring-1 ring-border-subtle hover:text-on-surface disabled:opacity-40">
            Listo
          </button>
        </div>
      </div>
    </Modal>
  )
}