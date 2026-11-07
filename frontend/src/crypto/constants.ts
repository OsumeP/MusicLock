/**
 * Parámetros criptográficos de MusicLock (docs/PlanMVP.md §4).
 *
 * Cambiar cualquiera de estos valores rompe la compatibilidad con los datos ya
 * cifrados: si hace falta, se crea una versión nueva (v2) y se conserva la v1.
 */

/** Parámetros de derivación que se guardan por usuario en el servidor (`kdf_params`). */
export interface KdfParams {
  alg: 'PBKDF2-SHA256'
  iterations: number
}

/** Mínimo aceptado al iniciar sesión: impide que un servidor malicioso o comprometido degrade la derivación. */
export const MIN_PBKDF2_ITERATIONS = 600_000

export const DEFAULT_KDF_PARAMS: KdfParams = {
  alg: 'PBKDF2-SHA256',
  iterations: MIN_PBKDF2_ITERATIONS,
}

export const SALT_BYTES = 16
/** IV de 96 bits: el tamaño recomendado para AES-GCM. */
export const IV_BYTES = 12
/** El tag de autenticación de AES-GCM añade 16 bytes a cada texto cifrado. */
export const GCM_TAG_BYTES = 16
export const AES_KEY_BITS = 256

/**
 * Etiquetas de contexto (separación de dominios).
 * - HKDF_INFO_*: dos secretos independientes derivados de la misma contraseña (D1).
 * - AAD_*: "datos adicionales autenticados" de AES-GCM. Atan cada texto cifrado a
 *   su propósito: un blob de audio no se puede hacer pasar por una clave envuelta,
 *   ni una File Key envuelta por la Master Key.
 */
export const HKDF_INFO_AUTH = 'musiclock/v1/auth-key'
export const HKDF_INFO_KEK = 'musiclock/v1/key-encryption-key'
export const AAD_MASTER_KEY = 'musiclock/v1/master-key'
export const AAD_FILE_KEY = 'musiclock/v1/file-key'
export const AAD_AUDIO = 'musiclock/v1/audio'

// --- Compartir (Semana 4, PlanMVP §4.6) --------------------------------------------

/** Par de claves por usuario: RSA-OAEP 3072 con SHA-256 (nativo de Web Crypto). */
export const RSA_MODULUS_BITS = 3072
/** Clave privada PKCS#8 envuelta con la Master Key. */
export const AAD_PRIVATE_KEY = 'musiclock/v1/private-key'
/** "label" de RSA-OAEP (el equivalente a la AAD): ata la File Key envuelta a su propósito. */
export const OAEP_LABEL_SHARED_FILE_KEY = 'musiclock/v1/shared-file-key'
