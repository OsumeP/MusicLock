import type { Comment } from '../api/comments'

/** Nodo del árbol: un comentario y sus respuestas, que son nodos del mismo tipo (patrón Composite). */
export interface CommentNode {
  comment: Comment
  replies: CommentNode[]
}

/**
 * Arma el árbol a partir de la lista plana en orden cronológico: las raíces y las
 * respuestas de cada nodo conservan ese orden. Si un padre faltara, el comentario
 * se muestra como raíz en lugar de perderse.
 */
export function buildCommentTree(comments: readonly Comment[]): CommentNode[] {
  const nodes = new Map<number, CommentNode>()
  for (const comment of comments) nodes.set(comment.id, { comment, replies: [] })

  const roots: CommentNode[] = []
  for (const comment of comments) {
    const node = nodes.get(comment.id)!
    const parent = comment.parentId === null ? undefined : nodes.get(comment.parentId)
    if (parent) parent.replies.push(node)
    else roots.push(node)
  }
  return roots
}

/** Cuántos comentarios hay sin contar los eliminados (que solo sostienen el hilo). */
export function countVisibleComments(comments: readonly Comment[]): number {
  return comments.filter((c) => !c.isDeleted).length
}