import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DashboardPage } from './DashboardPage'

vi.mock('../api/client', () => ({
  apiClient: { GET: vi.fn() },
}))
import { apiClient } from '../api/client'

function renderPage() {
  return render(
    <MantineProvider>
      <DashboardPage />
    </MantineProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.GET).mockReset()
  })

  it('renders stat tiles and source health cards once data loads', async () => {
    vi.mocked(apiClient.GET).mockImplementation(async (path: string) => {
      if (path === '/api/channels/channels/')
        return { data: { count: 1369 }, error: undefined } as never
      if (path === '/api/channels/streams/')
        return { data: { count: 36389 }, error: undefined } as never
      if (path === '/api/m3u/accounts/') {
        return {
          data: [
            {
              id: 1,
              name: 'https://trilo.tv',
              status: 'success',
              last_message: 'Processing completed',
              updated_at: '2026-08-08T19:31:55Z',
            },
          ],
          error: undefined,
        } as never
      }
      if (path === '/api/epg/sources/') {
        return {
          data: [
            {
              id: 1,
              name: 'https://trilo.tv',
              status: 'success',
              last_message: 'Parsed 539 programs',
              updated_at: '2026-08-08T19:25:56Z',
            },
          ],
          error: undefined,
        } as never
      }
      throw new Error(`unexpected path ${path}`)
    })

    renderPage()

    expect(await screen.findByText('1369')).toBeInTheDocument()
    expect(screen.getByText('36389')).toBeInTheDocument()
    expect(screen.getAllByText('https://trilo.tv')).toHaveLength(2)
  })

  it('shows a scoped error when EPG sources fail to load, without blocking the rest of the page', async () => {
    vi.mocked(apiClient.GET).mockImplementation(async (path: string) => {
      if (path === '/api/channels/channels/')
        return { data: { count: 1369 }, error: undefined } as never
      if (path === '/api/channels/streams/')
        return { data: { count: 36389 }, error: undefined } as never
      if (path === '/api/m3u/accounts/')
        return { data: [], error: undefined } as never
      if (path === '/api/epg/sources/')
        return { data: undefined, error: { detail: 'boom' } } as never
      throw new Error(`unexpected path ${path}`)
    })

    renderPage()

    expect(await screen.findByText('1369')).toBeInTheDocument()
    expect(screen.getByText('Failed to load EPG sources.')).toBeInTheDocument()
    expect(screen.getByText('No M3U accounts configured.')).toBeInTheDocument()
  })

  it('tolerates a rejected request without blanking the page', async () => {
    vi.mocked(apiClient.GET).mockImplementation(async (path: string) => {
      if (path === '/api/channels/channels/')
        throw new TypeError('Failed to fetch')
      if (path === '/api/channels/streams/')
        return { data: { count: 36389 }, error: undefined } as never
      if (path === '/api/m3u/accounts/')
        return { data: [], error: undefined } as never
      if (path === '/api/epg/sources/')
        return { data: [], error: undefined } as never
      throw new Error(`unexpected path ${path}`)
    })

    renderPage()

    expect(await screen.findByText('36389')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('No M3U accounts configured.')).toBeInTheDocument()
    expect(screen.getByText('No EPG sources configured.')).toBeInTheDocument()
  })
})
