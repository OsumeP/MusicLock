import { ApiError } from './client'

export interface HealthResponse {
  status: 'ok' | 'degraded'
  service: string
  database: 'ok' | 'error'
  storage: 'ok' | 'error'
}

/**
 * GET /api/health. El backend responde 503 cuando alguna dependencia falla,
 * pero el cuerpo sigue indicando qué falló, así que 503 también es una
 * respuesta válida (la API está viva aunque esté degradada).
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal, headers: { Accept: 'application/json' } })
  if (response.status !== 200 && response.status !== 503) {
    throw new ApiError(response.status, `GET /api/health → ${response.status}`)
  }
  return (await response.json()) as HealthResponse
}
