/**
 * API pública del módulo criptográfico de MusicLock.
 *
 * Reglas (CLAUDE.md): solo Web Crypto; IV aleatorio nuevo por operación; claves
 * no extraíbles siempre que se pueda; nunca enviar al servidor la contraseña, la
 * KEK, la Master Key ni File Keys sin envolver.
 */

export { encryptAudio, decryptAudio, type EncryptedAudio, type SongKeyMaterial } from './audio'
export {
  DEFAULT_KDF_PARAMS,
  GCM_TAG_BYTES,
  MIN_PBKDF2_ITERATIONS,
  type KdfParams,
} from './constants'
export { DecryptionError, UnsupportedKdfError } from './errors'
export { createVault, prepareLogin, prepareRewrap, type CreatedVault, type VaultRegistration } from './vault'
