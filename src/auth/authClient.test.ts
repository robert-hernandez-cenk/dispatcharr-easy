import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAuthStore, getStoredRefreshToken, REFRESH_TOKEN_KEY } from './authStore'
import { login, refreshAccessToken, logout } from './authClient'

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as Response
}

describe('authClient', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ accessToken: null, isAuthenticated: false })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('login stores both tokens on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access: 'a1', refresh: 'r1' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await login('rchernan', 'correct-password')

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/token/',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(useAuthStore.getState().accessToken).toBe('a1')
    expect(getStoredRefreshToken()).toBe('r1')
  })

  it('login returns false and stores nothing on invalid credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'No active account found' }, false)),
    )

    const result = await login('rchernan', 'wrong-password')

    expect(result).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('refreshAccessToken returns false when there is no stored refresh token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshAccessToken()

    expect(result).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshAccessToken updates the access token on success', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'r1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ access: 'a2' })))

    const result = await refreshAccessToken()

    expect(result).toBe(true)
    expect(useAuthStore.getState().accessToken).toBe('a2')
  })

  it('refreshAccessToken dedups concurrent calls into a single request', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'r1')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access: 'a2' }))
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([refreshAccessToken(), refreshAccessToken()])

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('logout clears the access token and the stored refresh token', () => {
    useAuthStore.getState().setTokens({ access: 'a1', refresh: 'r1' })

    logout()

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(getStoredRefreshToken()).toBeNull()
  })
})
