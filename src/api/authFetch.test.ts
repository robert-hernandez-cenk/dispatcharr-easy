import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authFetch } from './authFetch'

vi.mock('../auth/authClient', () => ({
  refreshAccessToken: vi.fn(),
  logout: vi.fn(),
}))

import { refreshAccessToken, logout } from '../auth/authClient'

// authFetch constructs a real Request internally. In a browser, `new Request('/api/...')`
// resolves relative URLs against document.baseURI automatically. This repo's Node runtime's
// global Request (from undici, not jsdom) has no such base and throws on a relative URL, so
// tests use an absolute URL here purely to work around that Node-in-tests artifact — it has
// no bearing on production behavior, where authFetch always runs in a real browser.
const API_URL = 'http://localhost/api/channels/channels/'

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

    await authFetch(API_URL)

    const [request] = fetchMock.mock.calls[0]
    expect((request as Request).headers.get('Authorization')).toBe('Bearer a1')
  })

  it('makes no Authorization header when there is no access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200))
    vi.stubGlobal('fetch', fetchMock)

    await authFetch(API_URL)

    const [request] = fetchMock.mock.calls[0]
    expect((request as Request).headers.has('Authorization')).toBe(false)
  })

  it('refreshes and retries once on a 401, then succeeds', async () => {
    useAuthStore.setState({ accessToken: 'expired', isAuthenticated: true })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      useAuthStore.setState({ accessToken: 'fresh', isAuthenticated: true })
      return true
    })

    const result = await authFetch(API_URL)

    expect(result.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [secondRequest] = fetchMock.mock.calls[1]
    expect((secondRequest as Request).headers.get('Authorization')).toBe(
      'Bearer fresh',
    )
  })

  it('logs out and returns the 401 response when refresh fails', async () => {
    useAuthStore.setState({ accessToken: 'expired', isAuthenticated: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)))
    vi.mocked(refreshAccessToken).mockResolvedValue(false)

    const result = await authFetch(API_URL)

    expect(result.status).toBe(401)
    expect(logout).toHaveBeenCalledOnce()
  })

  it('preserves headers and body across a 401 retry when given a real Request', async () => {
    useAuthStore.setState({ accessToken: 'expired', isAuthenticated: true })
    // A real fetch reads (and thereby consumes) the Request body. If authFetch retried with
    // the same already-read Request instead of a fresh `.clone()`, the second call below would
    // throw `TypeError: Body is unusable` instead of silently succeeding — that's what makes
    // `.clone()` load-bearing and this test an actual regression guard rather than a no-op.
    const seenBodies: string[] = []
    let statusCount = 0
    const fetchMock = vi.fn(async (req: Request) => {
      seenBodies.push(await req.text())
      return statusCount++ === 0 ? response(401) : response(200)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      useAuthStore.setState({ accessToken: 'fresh', isAuthenticated: true })
      return true
    })

    const body = JSON.stringify({ foo: 'bar' })
    const request = new Request(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const result = await authFetch(request)

    expect(result.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [firstReq] = fetchMock.mock.calls[0]
    const [secondReq] = fetchMock.mock.calls[1]
    expect((firstReq as Request).headers.get('Content-Type')).toBe(
      'application/json',
    )
    expect((secondReq as Request).headers.get('Content-Type')).toBe(
      'application/json',
    )
    expect((secondReq as Request).headers.get('Authorization')).toBe(
      'Bearer fresh',
    )
    expect(seenBodies).toEqual([body, body])
  })
})
