/**
 * Patrón Iterator (docs/Claude/Patrones.md §3.1) para recorrer una colección de
 * canciones —una playlist, Mis Archivos, Favoritos…— en distintos órdenes sin que
 * el reproductor conozca la estructura de la colección ni cómo se baraja.
 *
 *   SongCollection.createIterator(modo) ──► SongIterator
 *                                            ├─ SequentialIterator  orden original, termina al final
 *                                            ├─ ShuffleIterator     orden aleatorio, termina al final
 *                                            └─ LoopIterator        vuelve al principio (en orden o barajado)
 *
 * Además de `hasNext()`/`next()` del patrón, los iteradores ofrecen
 * `hasPrevious()`/`previous()` para el botón "anterior" del reproductor.
 */

import type { Song } from '../api/songs'

export interface SongIterator {
  /** Canción en la posición actual (null si la colección está vacía). */
  current(): Song | null
  hasNext(): boolean
  /** Avanza y devuelve la nueva canción actual. Lanza RangeError si no hay siguiente. */
  next(): Song
  hasPrevious(): boolean
  previous(): Song
  /** Todas las canciones en el orden en que este iterador las recorre. */
  traversal(): readonly Song[]
}

export interface PlaybackMode {
  /** Orden aleatorio. */
  shuffle: boolean
  /** Al terminar, vuelve a empezar. */
  repeat: boolean
}

/** Fuente de aleatoriedad: [0, 1). Inyectable para que los tests sean deterministas. */
export type RandomSource = () => number

/** Interfaz `IterableCollection` del patrón. */
export interface IterableSongCollection {
  createIterator(mode: PlaybackMode, startSongId?: string): SongIterator
}

/** Base común: recorre `order` desde `position`; las subclases deciden si da la vuelta. */
abstract class OrderedIterator implements SongIterator {
  protected position: number
  protected abstract readonly wraps: boolean
  private readonly order: readonly Song[]

  protected constructor(order: readonly Song[], start: number) {
    this.order = order
    this.position = order.length === 0 ? -1 : Math.min(Math.max(start, 0), order.length - 1)
  }

  current(): Song | null {
    return this.order[this.position] ?? null
  }

  hasNext(): boolean {
    return this.order.length > 0 && (this.wraps || this.position + 1 < this.order.length)
  }

  next(): Song {
    if (!this.hasNext()) throw new RangeError('No hay siguiente canción.')
    this.position = (this.position + 1) % this.order.length
    return this.order[this.position]
  }

  hasPrevious(): boolean {
    return this.order.length > 0 && (this.wraps || this.position > 0)
  }

  previous(): Song {
    if (!this.hasPrevious()) throw new RangeError('No hay canción anterior.')
    this.position = (this.position - 1 + this.order.length) % this.order.length
    return this.order[this.position]
  }

  traversal(): readonly Song[] {
    return this.order
  }
}

/** Recorre las canciones en su orden original y se detiene en la última. */
export class SequentialIterator extends OrderedIterator {
  protected readonly wraps = false

  constructor(songs: readonly Song[], start = 0) {
    super(songs, start)
  }
}

/**
 * Baraja con Fisher-Yates. Si se indica `first`, esa canción queda primera (la que
 * el usuario pulsó suena ya y el resto sigue en orden aleatorio).
 */
export function shuffled(songs: readonly Song[], random: RandomSource, first?: number): Song[] {
  const rest = songs.filter((_, i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return first !== undefined && songs[first] ? [songs[first], ...rest] : rest
}

/** Recorre las canciones en un orden aleatorio (cada una una vez) y se detiene al final. */
export class ShuffleIterator extends OrderedIterator {
  protected readonly wraps = false

  constructor(songs: readonly Song[], start = 0, random: RandomSource = Math.random) {
    super(shuffled(songs, random, songs.length > 0 ? start : undefined), 0)
  }
}

/** Recorre las canciones de forma cíclica: después de la última vuelve a la primera. */
export class LoopIterator extends OrderedIterator {
  protected readonly wraps = true

  constructor(songs: readonly Song[], start = 0) {
    super(songs, start)
  }
}

/**
 * Colección concreta: la cola que se reproduce (las canciones de la playlist o de
 * la lista visible cuando se pulsó ▶).
 */
export class SongQueue implements IterableSongCollection {
  readonly songs: readonly Song[]
  private readonly random: RandomSource

  constructor(songs: readonly Song[], random: RandomSource = Math.random) {
    this.songs = songs
    this.random = random
  }

  createIterator({ shuffle, repeat }: PlaybackMode, startSongId?: string): SongIterator {
    const found = startSongId === undefined ? -1 : this.songs.findIndex((s) => s.id === startSongId)
    const start = Math.max(found, 0)
    if (repeat) {
      // Bucle sobre el orden original o sobre uno barajado (la canción inicial primero).
      return shuffle ? new LoopIterator(shuffled(this.songs, this.random, this.songs.length > 0 ? start : undefined), 0) : new LoopIterator(this.songs, start)
    }
    return shuffle ? new ShuffleIterator(this.songs, start, this.random) : new SequentialIterator(this.songs, start)
  }
}
