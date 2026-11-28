import { describe, expect, it } from 'vitest'

import type { Comment } from '../api/comments'
import { buildCommentTree, countVisibleComments } from './tree'

let nextId = 1
function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: nextId++, parentId: null, depth: 0, author: 'ana', body: 'hola', createdAt: '2026-11-18T00:00:00Z',
    editedAt: null, isDeleted: false, bySongOwner: false, isMine: false, canEdit: false, canDelete: false,
    ...overrides,
  }
}

describe('buildCommentTree', () => {
  it('agrupa las respuestas bajo su padre y conserva el orden cronológico', () => {
    const a = comment({ body: 'A' })
    const b = comment({ body: 'B' })
    const a1 = comment({ body: 'A1', parentId: a.id, depth: 1 })
    const a2 = comment({ body: 'A2', parentId: a.id, depth: 1 })
    const a1x = comment({ body: 'A1x', parentId: a1.id, depth: 2 })

    const tree = buildCommentTree([a, b, a1, a2, a1x])

    expect(tree.map((n) => n.comment.body)).toEqual(['A', 'B'])
    expect(tree[0].replies.map((n) => n.comment.body)).toEqual(['A1', 'A2'])
    expect(tree[0].replies[0].replies.map((n) => n.comment.body)).toEqual(['A1x'])
    expect(tree[1].replies).toEqual([])
  })

  it('una lista vacía da un árbol vacío', () => {
    expect(buildCommentTree([])).toEqual([])
  })

  it('un comentario cuyo padre falta se muestra como raíz en lugar de perderse', () => {
    const huérfano = comment({ body: 'huérfano', parentId: 9999, depth: 1 })
    expect(buildCommentTree([huérfano]).map((n) => n.comment.body)).toEqual(['huérfano'])
  })

  it('conserva los eliminados como soporte del hilo', () => {
    const raíz = comment({ isDeleted: true, body: '', author: null })
    const hija = comment({ body: 'sigue', parentId: raíz.id, depth: 1 })

    const tree = buildCommentTree([raíz, hija])

    expect(tree[0].comment.isDeleted).toBe(true)
    expect(tree[0].replies[0].comment.body).toBe('sigue')
  })
})

describe('countVisibleComments', () => {
  it('no cuenta los eliminados', () => {
    expect(countVisibleComments([comment(), comment({ isDeleted: true }), comment()])).toBe(2)
  })
})