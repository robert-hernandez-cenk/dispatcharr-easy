import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authFetch } from './authFetch'

vi.mock('../auth/authClient', () => ({
  refreshAccessToken: vi.fn(),
  logout: vi.fn(),
}))

import { refreshAccessToken, logout } from '../auth/authClient'

function response(status: number): Response {
  return { status, ok: status < 400 } as Response
}

describe('authFetch', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, isAuthenticated: false })
    vi.mocked(refreshAccessToken).mockReset()
    vi.mocked(logout).mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches the Authorization header when an access token is present', async () => {
    useAuthStore.setState({ accessToken: 'a1', isAuthenticated: true })
    const fetchMock = vi.fn().mockResolvedValue(response(200))
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/channels/channels/')

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer a1')
  })

  it('makes no Authorization header when there is no access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200))
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/channels/channels/')

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Headers).has('Authorization')).toBe(false)
  })

  it('refreshes and retries once on a 401, then succeeds', async () => {
    useAuthStore.setState({ accessToken: 'expired', isAuthenticated: true })
    const fetchMock = vi.fn().mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200))
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      useAuthStore.setState({ accessToken: 'fresh', isAuthenticated: true })
      return true
    })

    const result = await authFetch('/api/channels/channels/')

    expect(result.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, secondInit] = fetchMock.mock.calls[1]
    expect((secondInit.headers as Headers).get('Authorization')).toBe('Bearer fresh')
  })

  it('logs out and returns the 401 response when refresh fails', async () => {
    useAuthStore.setState({ accessToken: 'expired', isAuthenticated: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)))
    vi.mocked(refreshAccessToken).mockResolvedValue(false)

    const result = await authFetch('/api/channels/channels/')

    expect(result.status).toBe(401)
    expect(logout).toHaveBeenCalledOnce()
  })
})
