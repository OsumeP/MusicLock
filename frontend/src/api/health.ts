import { apiGet } from './client'

export interface HealthResponse {
  status: 'ok' | 'degraded'
  service: string
  database: 'ok' | 'error'
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/health', { signal })
}
