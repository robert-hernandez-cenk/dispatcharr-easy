import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { useAuthStore, REFRESH_TOKEN_KEY } from './authStore'
import { AuthGate } from './AuthGate'

vi.mock('./authClient', () => ({
  refreshAccessToken: vi.fn(),
}))
import { refreshAccessToken } from './authClient'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderGate() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <AuthGate>
          <div>protected content</div>
        </AuthGate>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('AuthGate', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ accessToken: null, isAuthenticated: false })
    mockNavigate.mockReset()
    vi.mocked(refreshAccessToken).mockReset()
  })

  it('renders children when already authenticated', async () => {
    useAuthStore.setState({ accessToken: 'a1', isAuthenticated: true })
    renderGate()

    expect(await screen.findByText('protected content')).toBeInTheDocument()
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('redirects to /login with no stored session, without attempting a refresh', async () => {
    renderGate()

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true }),
    )
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
  })

  it('attempts a silent refresh when a refresh token is stored, then renders children on success', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'r1')
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      useAuthStore.setState({ accessToken: 'a2', isAuthenticated: true })
      return true
    })
    renderGate()

    expect(await screen.findByText('protected content')).toBeInTheDocument()
    expect(refreshAccessToken).toHaveBeenCalledOnce()
  })

  it('redirects to /login when the silent refresh fails', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'r1')
    vi.mocked(refreshAccessToken).mockResolvedValue(false)
    renderGate()

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true }),
    )
  })

  it('redirects to /login if isAuthenticated later flips to false (e.g. a failed background refresh)', async () => {
    useAuthStore.setState({ accessToken: 'a1', isAuthenticated: true })
    renderGate()
    expect(await screen.findByText('protected content')).toBeInTheDocument()

    useAuthStore.setState({ accessToken: null, isAuthenticated: false })

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true }),
    )
  })
})
