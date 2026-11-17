import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../api/auth'
import { AuthContext, type AuthContextValue } from '../auth/session'
import { formatListeningTime } from '../lib/format'
import { PlayerProvider } from '../player/PlayerProvider'
import { StatsPage } from './StatsPage'

const user = { id: 1, email: 'ana@x.com', username: 'ana', hasKeyPair: true } as User

function songDto(i: number, title: string, artist = '') {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title, artist, duration: 125, size: 1000, creation_date: '2026-11-01T00:00:00Z',
    file_iv: 'aXY=', wrapped_file_key: 'a2V5', wrapped_key_iv: 'aXY=', is_favorite: false, favorited_at: null,
  }
}

function days(n: number, plays: (i: number) => number) {
  const start = new Date(2026, 10, 6 - (n - 1))
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: iso, plays: plays(i) }
  })
}

const STATS = {
  period: '7d',
  since: '2026-10-31',
  total_plays: 6,
  listening_seconds: 3720,
  distinct_songs: 2,
  top_songs: [
    { song: songDto(1, 'Brisa', 'Aethel'), plays: 4 },
    { song: songDto(2, 'Cierzo'), plays: 2 },
  ],
  top_artists: [
    { artist: 'Aethel', plays: 4, listening_seconds: 500, songs: 1 },
    { artist: '', plays: 2, listening_seconds: 250, songs: 1 },
  ],
  daily: days(7, (i) => [0, 1, 0, 0, 2, 0, 3][i]),
}

let calls: string[]
let respond: (period: string) => object

function renderStats(path = '/tendencias') {
  const auth = { session: { status: 'ready', user, masterKey: {} as CryptoKey } } as AuthContextValue
  render(
    <AuthContext.Provider value={auth}>
      <PlayerProvider>
        <MemoryRouter initialEntries={[path]}>
          <StatsPage />
        </MemoryRouter>
      </PlayerProvider>
    </AuthContext.Provider>,
  )
}

describe('StatsPage', () => {
  beforeEach(() => {
    calls = []
    respond = () => STATS
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        if (url.startsWith('/api/stats')) return new Response(JSON.stringify(respond(new URL(url, 'http://x').searchParams.get('period')!)))
        return new Response('{"code":"blob_missing"}', { status: 404 })
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('muestra el resumen, las canciones y artistas más escuchados de los últimos 7 días', async () => {
    renderStats()

    const summary = await screen.findByLabelText('Resumen de los últimos 7 días')
    expect(within(summary).getByText('6')).toBeInTheDocument()
    expect(within(summary).getByText('1 h 2 min')).toBeInTheDocument()
    expect(within(summary).getByText('Aethel')).toBeInTheDocument()
    expect(calls[0]).toBe('/api/stats?period=7d')

    const songs = screen.getByRole('region', { name: 'Tus canciones más escuchadas' })
    expect(within(songs).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Brisa.*4 reproducciones/),
      expect.stringMatching(/Cierzo.*2 reproducciones/),
    ])
    const artists = screen.getByRole('region', { name: 'Tus artistas más escuchados' })
    expect(within(artists).getByText('Sin artista')).toBeInTheDocument()
    expect(within(artists).getByText(/4 reproducciones · 8 min · 1 canción/)).toBeInTheDocument()
  })

  it('el gráfico diario tiene una columna accesible por día, tooltip al pasar el ratón y vista de tabla', async () => {
    const u = userEvent.setup()
    renderStats()

    const chart = await screen.findByRole('list', { name: 'Reproducciones por día' })
    const columns = within(chart).getAllByRole('listitem')
    expect(columns).toHaveLength(7)
    expect(columns[6]).toHaveAccessibleName(/6 de noviembre: 3 reproducciones/)
    expect(columns[1]).toHaveAccessibleName(/1 reproducción$/)

    fireEvent.pointerEnter(columns[4])
    expect(screen.getByRole('status')).toHaveTextContent('2 reproducciones')

    await u.click(screen.getByRole('button', { name: 'Ver como tabla' }))
    const table = screen.getByRole('table', { name: 'Reproducciones por día' })
    expect(within(table).getAllByRole('row')).toHaveLength(8)
  })

  it('cambiar de periodo pide los datos de ese periodo; "Todo el tiempo" no tiene gráfico diario', async () => {
    const u = userEvent.setup()
    respond = (period) => ({ ...STATS, period, since: period === 'all' ? null : STATS.since, daily: period === 'all' ? [] : period === '30d' ? days(30, () => 1) : STATS.daily })
    renderStats()
    await screen.findByRole('list', { name: 'Reproducciones por día' })

    await u.click(screen.getByRole('button', { name: '30 días' }))
    await waitFor(() => expect(calls).toContain('/api/stats?period=30d'))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Reproducciones por día' })).getAllByRole('listitem')).toHaveLength(30))
    expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true')

    await u.click(screen.getByRole('button', { name: 'Todo el tiempo' }))
    await waitFor(() => expect(calls).toContain('/api/stats?period=all'))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Reproducciones por día' })).not.toBeInTheDocument())
  })

  it('sin reproducciones muestra un estado vacío', async () => {
    respond = () => ({ ...STATS, total_plays: 0, listening_seconds: 0, distinct_songs: 0, top_songs: [], top_artists: [], daily: days(7, () => 0) })
    renderStats()
    expect(await screen.findByText('Sin reproducciones en los últimos 7 días')).toBeInTheDocument()
  })

  it('▶ en el ranking reproduce esa canción', async () => {
    const u = userEvent.setup()
    renderStats()
    await u.click(await screen.findByRole('button', { name: 'Reproducir Cierzo' }))
    await waitFor(() => expect(calls).toContain(`/api/songs/${songDto(2, '').id}/blob`))
  })
})

describe('formatListeningTime', () => {
  it('formatea minutos y horas', () => {
    expect([0, 20, 60, 3600, 3720, 7260].map(formatListeningTime)).toEqual(['0 min', '< 1 min', '1 min', '1 h', '1 h 2 min', '2 h 1 min'])
  })
})
