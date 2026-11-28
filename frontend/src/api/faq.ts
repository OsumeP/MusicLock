import { apiRequest } from './client'

export interface Faq {
  id: number
  question: string
  answer: string
}

/** GET /api/faq/ — preguntas frecuentes activas (público, sin sesión). */
export function listFaqs(signal?: AbortSignal): Promise<Faq[]> {
  return apiRequest<Faq[]>('/faq/', { auth: false, signal })
}