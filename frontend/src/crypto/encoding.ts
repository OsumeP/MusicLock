/**
 * Conversión entre bytes y base64. El material criptográfico viaja a la API y se
 * guarda en la base de datos como texto base64 (decisión I10).
 */

const textEncoder = new TextEncoder()

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(text) as Uint8Array<ArrayBuffer>
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  // Por bloques: String.fromCharCode(...array) falla con arrays grandes.
  const CHUNK = 0x8000
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    throw new TypeError('Base64 inválido')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** `crypto.getRandomValues` admite como máximo 65 536 bytes por llamada; se llena por bloques. */
const MAX_RANDOM_CHUNK = 65_536

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  for (let offset = 0; offset < length; offset += MAX_RANDOM_CHUNK) {
    crypto.getRandomValues(bytes.subarray(offset, offset + MAX_RANDOM_CHUNK))
  }
  return bytes
}
