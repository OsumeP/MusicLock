import { describe, expect, it } from 'vitest'

import type { Song } from '../api/songs'
import { LoopIterator, SequentialIterator, ShuffleIterator, SongQueue, shuffled, type SongIterator } from './iterators'

const songs = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id }) as Song)

/** Aleatoriedad determinista (generador congruencial) para que los tests no dependan del azar. */
function seeded(seed = 7) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

/** Recorre con next() hasta que no haya siguiente (o `limit` pasos) y devuelve los ids. */
function drain(iterator: SongIterator, limit = 10): string[] {
  const ids = [iterator.current()!.id]
  while (iterator.hasNext() && ids.length < limit) ids.push(iterator.next().id)
  return ids
}

describe('SequentialIterator', () => {
  it('recorre en el orden original desde la canción inicial y se detiene al final', () => {
    const iterator = new SequentialIterator(songs, 1)

    expect(drain(iterator)).toEqual(['b', 'c', 'd'])
    expect(iterator.hasNext()).toBe(false)
    expect(() => iterator.next()).toThrow(RangeError)
  })

  it('previous() retrocede y no pasa de la primera', () => {
    const iterator = new SequentialIterator(songs, 1)

    expect(iterator.previous().id).toBe('a')
    expect(iterator.hasPrevious()).toBe(false)
    expect(() => iterator.previous()).toThrow(RangeError)
  })

  it('una colección vacía no tiene canción actual ni siguiente', () => {
    const iterator = new SequentialIterator([])
    expect(iterator.current()).toBeNull()
    expect(iterator.hasNext()).toBe(false)
    expect(iterator.hasPrevious()).toBe(false)
  })
})

describe('ShuffleIterator', () => {
  it('empieza por la canción elegida y recorre todas exactamente una vez', () => {
    const iterator = new ShuffleIterator(songs, 2, seeded())

    const ids = drain(iterator)

    expect(ids[0]).toBe('c')
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(iterator.hasNext()).toBe(false)
  })

  it('el orden depende del azar (con otra semilla, otro orden) y no altera la colección', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }) as Song)
    const copy = [...many]

    const first = drain(new ShuffleIterator(many, 0, seeded(1)), 20)
    const second = drain(new ShuffleIterator(many, 0, seeded(99)), 20)

    expect(first).not.toEqual(second)
    expect(first).not.toEqual(many.map((s) => s.id))
    expect(many).toEqual(copy)
  })

  it('previous() vuelve por el mismo orden barajado', () => {
    const iterator = new ShuffleIterator(songs, 0, seeded())
    const second = iterator.next().id
    iterator.next()

    expect(iterator.previous().id).toBe(second)
  })
})

describe('LoopIterator', () => {
  it('después de la última vuelve a la primera (siempre hay siguiente)', () => {
    const iterator = new LoopIterator(songs, 2)

    expect(drain(iterator, 7)).toEqual(['c', 'd', 'a', 'b', 'c', 'd', 'a'])
    expect(iterator.hasNext()).toBe(true)
  })

  it('previous() desde la primera va a la última; con una sola canción se repite ella misma', () => {
    expect(new LoopIterator(songs, 0).previous().id).toBe('d')

    const single = new LoopIterator([songs[0]])
    expect(single.next().id).toBe('a')
    expect(single.next().id).toBe('a')
  })
})

describe('SongQueue.createIterator', () => {
  const queue = new SongQueue(songs, seeded())

  it('elige el iterador según el modo', () => {
    expect(queue.createIterator({ shuffle: false, repeat: false }, 'b')).toBeInstanceOf(SequentialIterator)
    expect(queue.createIterator({ shuffle: true, repeat: false }, 'b')).toBeInstanceOf(ShuffleIterator)
    expect(queue.createIterator({ shuffle: false, repeat: true }, 'b')).toBeInstanceOf(LoopIterator)
  })

  it('aleatorio + repetir: bucle sobre un orden barajado que empieza por la canción elegida', () => {
    const iterator = queue.createIterator({ shuffle: true, repeat: true }, 'd')

    const ids = drain(iterator, 8)

    expect(ids[0]).toBe('d')
    expect([...ids.slice(0, 4)].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(ids.slice(4)).toEqual(ids.slice(0, 4)) // la segunda vuelta repite el mismo orden
  })

  it('una canción inicial desconocida empieza por la primera', () => {
    expect(queue.createIterator({ shuffle: false, repeat: false }, 'zzz').current()!.id).toBe('a')
  })
})

describe('shuffled', () => {
  it('sin canción fija devuelve una permutación', () => {
    expect(shuffled(songs, seeded()).map((s) => s.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})
