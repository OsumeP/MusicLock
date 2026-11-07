/**
 * Clave privada propia para abrir canciones compartidas conmigo (día 18).
 *
 * Se obtiene una sola vez por sesión: el servidor la entrega envuelta con la
 * Master Key (`GET /api/me/keypair`) y se desenvuelve aquí como CryptoKey NO
 * extraíble. Se guarda por Master Key: al cerrar sesión la Master Key cambia y la
 * entrada deja de usarse (WeakMap: no retiene claves de sesiones anteriores).
 */

import { fetchKeyPair } from '../api/auth'
import { unlockPrivateKey } from '../crypto'

const cache = new WeakMap<CryptoKey, Promise<CryptoKey>>()

export function getPrivateKey(masterKey: CryptoKey): Promise<CryptoKey> {
  let pending = cache.get(masterKey)
  if (!pending) {
    pending = fetchKeyPair().then((keyPair) => unlockPrivateKey(keyPair.wrappedPrivateKey, keyPair.privateKeyIv, masterKey))
    // Si falla (red, aún sin par), se reintenta la próxima vez.
    pending.catch(() => cache.delete(masterKey))
    cache.set(masterKey, pending)
  }
  return pending
}
