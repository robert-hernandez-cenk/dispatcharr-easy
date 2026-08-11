import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'

vi.mock('../api/client', () => ({
  apiClient: { GET: vi.fn() },
}))
vi.mock('../auth/authClient', () => ({
  logout: vi.fn(),
}))
import { apiClient } from '../api/client'
import { logout } from '../auth/authClient'

function renderLayout() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <AppLayout>
          <div>page content</div>
        </AppLayout>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.mocked(apiClient.GET).mockReset()
    vi.mocked(logout).mockReset()
  })

  it('renders its children', () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: undefined,
    } as never)
    renderLayout()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })

  it('shows the current username once loaded', async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { id: 1, username: 'rchernan' },
      error: undefined,
    } as never)
    renderLayout()
    expect(await screen.findByText('rchernan')).toBeInTheDocument()
  })

  it('logs out when "Log out" is clicked', async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { id: 1, username: 'rchernan' },
      error: undefined,
    } as never)
    const user = userEvent.setup()
    renderLayout()

    await user.click(await screen.findByText('rchernan'))
    await user.click(await screen.findByText('Log out'))

    expect(logout).toHaveBeenCalledOnce()
  })

  it('toggles the color-scheme icon when clicked', async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: undefined,
    } as never)
    const user = userEvent.setup()
    renderLayout()

    const toggle = screen.getByRole('button', { name: 'Toggle color scheme' })
    const initialLabel = toggle.textContent
    await user.click(toggle)
    expect(toggle.textContent).not.toBe(initialLabel)
  })
})
