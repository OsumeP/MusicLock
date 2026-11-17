// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { FileValidationError, hasMp3Signature, titleFromFileName, validateMp3File } from './mp3'

const MiB = 1024 * 1024
const limits = { maxFileSizeBytes: 20 * MiB, storageAvailable: 500 * MiB }

const ID3 = [0x49, 0x44, 0x33, 0x04]
const MPEG_FRAME = [0xff, 0xfb, 0x90, 0x64] // MPEG-1 Layer III
const RIFF = [0x52, 0x49, 0x46, 0x46] // WAV

function file(bytes: number[], name = 'cancion.mp3', size = 1024, type = 'audio/mpeg') {
  const data = new Uint8Array(size)
  data.set(bytes)
  return new File([data], name, { type })
}

describe('hasMp3Signature', () => {
  it('reconoce ID3v2 y tramas MPEG Layer III', () => {
    expect(hasMp3Signature(new Uint8Array(ID3))).toBe(true)
    expect(hasMp3Signature(new Uint8Array(MPEG_FRAME))).toBe(true)
  })

  it('rechaza WAV, FLAC y MPEG de otras capas', () => {
    expect(hasMp3Signature(new Uint8Array(RIFF))).toBe(false)
    expect(hasMp3Signature(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // "fLaC"
    expect(hasMp3Signature(new Uint8Array([0xff, 0xfd, 0x90, 0x64]))).toBe(false) // Layer II
  })
})

describe('validateMp3File', () => {
  it('acepta un MP3 válido', async () => {
    await expect(validateMp3File(file(ID3), limits)).resolves.toBeUndefined()
    await expect(validateMp3File(file(MPEG_FRAME, 'x.MP3', 1024, ''), limits)).resolves.toBeUndefined()
  })

  it('rechaza otros formatos por extensión/tipo (BR-11)', async () => {
    await expect(validateMp3File(file(RIFF, 'stem.wav', 1024, 'audio/wav'), limits)).rejects.toThrow('Solo se aceptan archivos MP3.')
  })

  it('rechaza un WAV renombrado a .mp3', async () => {
    await expect(validateMp3File(file(RIFF, 'falso.mp3'), limits)).rejects.toThrow(/no parece un MP3/)
  })

  it('aplica el límite por archivo contando los 16 bytes del cifrado (BR-10)', async () => {
    await expect(validateMp3File(file(ID3, 'a.mp3', 20 * MiB - 16), limits)).resolves.toBeUndefined()
    await expect(validateMp3File(file(ID3, 'a.mp3', 20 * MiB - 15), limits)).rejects.toThrow(/máximo de tu plan/)
  })

  it('aplica la cuota disponible (BR-09)', async () => {
    const almostFull = { ...limits, storageAvailable: 1000 }
    await expect(validateMp3File(file(ID3, 'a.mp3', 2000), almostFull)).rejects.toThrow(FileValidationError)
  })

  it('rechaza archivos vacíos', async () => {
    await expect(validateMp3File(new File([], 'vacio.mp3', { type: 'audio/mpeg' }), limits)).rejects.toThrow('vacío')
  })
})

describe('titleFromFileName', () => {
  it('quita la extensión', () => {
    expect(titleFromFileName('01 - Mi Canción.MP3')).toBe('01 - Mi Canción')
    expect(titleFromFileName('.mp3')).toBe('Sin título')
  })
})
