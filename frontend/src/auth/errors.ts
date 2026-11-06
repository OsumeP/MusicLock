import { ApiError } from '../api/client'
import { DecryptionError, UnsupportedKdfError } from '../crypto'

/** Mensaje para el usuario a partir de un error de login o registro. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'invalid_credentials') return 'Correo o contraseña incorrectos.'
    if (error.code === 'account_blocked') return 'Esta cuenta está bloqueada. Contacta al administrador.'
    if (error.status === 429) return 'Demasiados intentos. Espera un minuto antes de volver a intentarlo.'
    if (error.status === 400) return 'Revisa los datos del formulario.'
    if (error.status >= 500) return 'El servidor no está disponible en este momento. Inténtalo más tarde.'
    return error.message
  }
  if (error instanceof UnsupportedKdfError) {
    return 'El servidor envió parámetros de seguridad no válidos. Por seguridad no se continuó.'
  }
  if (error instanceof DecryptionError) {
    return 'No se pudo abrir la bóveda con esta contraseña.'
  }
  if (error instanceof TypeError) return 'No hay conexión con el servidor.'
  return 'Ocurrió un error inesperado.'
}
