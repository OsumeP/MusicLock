/**
 * Validación de la contraseña en el navegador (decisión I23).
 *
 * Django solo recibe el authKey derivado, así que la fortaleza de la contraseña
 * real solo se puede juzgar aquí. Es especialmente importante en MusicLock: la
 * contraseña protege la Master Key y no hay recuperación (D8).
 */

export const MIN_PASSWORD_LENGTH = 12

/** Contraseñas muy comunes (y variantes del nombre del producto). Lista corta a propósito. */
const COMMON_PASSWORDS = new Set([
  '123456789012',
  'contraseña123',
  'contrasena123',
  'password1234',
  'qwertyuiop12',
  'musiclock123',
  'musiclock2026',
  'iloveyou1234',
  'aaaaaaaaaaaa',
])

export interface PasswordCheck {
  /** 0 (muy débil) a 4 (muy fuerte). */
  score: 0 | 1 | 2 | 3 | 4
  /** true si se puede usar para registrarse. */
  acceptable: boolean
  /** Problemas que impiden usarla, en español, para mostrar al usuario. */
  problems: string[]
}

function characterClasses(password: string): number {
  return [/[a-zà-ÿ]/, /[A-ZÀ-Ý]/, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(password)).length
}

export function checkPassword(password: string, context: { email?: string; username?: string } = {}): PasswordCheck {
  const problems: string[] = []
  const lower = password.toLowerCase()

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  }
  if (COMMON_PASSWORDS.has(lower)) {
    problems.push('Es una contraseña demasiado común.')
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push('No puede ser un solo carácter repetido.')
  }
  const personal = [context.username, context.email?.split('@')[0]]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => !!value && value.length >= 3)
  if (personal.some((value) => lower.includes(value))) {
    problems.push('No debe contener tu nombre de usuario ni tu correo.')
  }

  const classes = characterClasses(password)
  let score = 0
  if (password.length >= MIN_PASSWORD_LENGTH) score++
  if (password.length >= 16) score++
  if (classes >= 3) score++
  if (password.length >= 20 || (password.length >= 14 && classes === 4)) score++
  if (problems.length > 0) score = Math.min(score, 1)

  return { score: score as PasswordCheck['score'], acceptable: problems.length === 0, problems }
}
