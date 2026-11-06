/**
 * Cliente HTTP base. Todas las rutas son relativas (/api/...) y en desarrollo
 * las resuelve el proxy de Vite. A partir del día 4 aquí se añade el JWT y el
 * refresh automático.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })

  if (!response.ok) {
    throw new ApiError(response.status, `GET /api${path} → ${response.status}`)
  }
  return (await response.json()) as T
}
