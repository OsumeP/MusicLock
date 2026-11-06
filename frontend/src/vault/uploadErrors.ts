import { ApiError } from '../api/client'
import { FileValidationError } from './mp3'

export function uploadErrorMessage(error: unknown): string {
  if (error instanceof FileValidationError) return error.message
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'file_too_large':
        return 'El archivo supera el máximo permitido por tu plan.'
      case 'quota_exceeded':
        return 'No tienes espacio suficiente en tu plan para este archivo.'
      case 'empty_file':
        return 'El archivo está vacío.'
      case 'storage_unavailable':
        return 'El almacenamiento no está disponible. Inténtalo de nuevo en unos minutos.'
    }
    if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
    if (error.status === 400) return 'El servidor rechazó los datos del archivo.'
    return error.message
  }
  if (error instanceof DOMException && error.name === 'AbortError') return 'Subida cancelada.'
  if (error instanceof TypeError) return 'Se perdió la conexión con el servidor durante la subida.'
  return 'No se pudo subir el archivo.'
}
