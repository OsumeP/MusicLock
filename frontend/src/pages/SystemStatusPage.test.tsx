import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SystemStatusPage } from './SystemStatusPage'

function rowFor(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement
}

describe('SystemStatusPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra la API y la base de datos operativas cuando /api/health responde ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok', service: 'musiclock-api', database: 'ok' }), { status: 200 }),
      ),
    )

    render(<SystemStatusPage />)

    expect(await within(rowFor('API')).findByText('Operativo')).toBeInTheDocument()
    expect(within(rowFor('Base de datos')).getByText('Operativo')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.anything())
  })

  it('muestra error cuando la API no responde', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<SystemStatusPage />)

    expect(await within(rowFor('API')).findByText('Sin conexión')).toBeInTheDocument()
  })
})
