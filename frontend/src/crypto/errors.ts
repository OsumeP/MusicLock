/** No se pudo descifrar: clave incorrecta (p. ej. contraseña equivocada) o datos alterados. */
export class DecryptionError extends Error {
  constructor(message = 'No se pudo descifrar: la clave no es correcta o los datos fueron alterados', options?: ErrorOptions) {
    super(message, options)
    this.name = 'DecryptionError'
  }
}

/** Los parámetros de derivación recibidos no son aceptables (algoritmo desconocido o demasiado débiles). */
export class UnsupportedKdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedKdfError'
  }
}
