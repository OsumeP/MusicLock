// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { fromBase64, randomBytes, toBase64 } from './encoding'

describe('base64', () => {
  it('ida y vuelta conserva los bytes, también en arrays grandes', () => {
    for (const size of [0, 1, 2, 3, 100, 70_000]) {
      const bytes = randomBytes(size)
      expect(fromBase64(toBase64(bytes))).toEqual(bytes)
    }
  })

  it('produce base64 estándar', () => {
    expect(toBase64(new Uint8Array([0xfb, 0xff, 0x00]))).toBe('+/8A')
    expect(fromBase64('+/8A')).toEqual(new Uint8Array([0xfb, 0xff, 0x00]))
  })

  it('rechaza texto que no es base64', () => {
    expect(() => fromBase64('esto no es base64!')).toThrow(TypeError)
  })
})
