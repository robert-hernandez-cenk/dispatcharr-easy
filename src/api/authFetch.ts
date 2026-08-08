import { useAuthStore } from '../auth/authStore'
import { refreshAccessToken, logout } from '../auth/authClient'

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const base = new Request(input, init)

  const response = await fetchWithToken(base.clone())
  if (response.status !== 401) {
    return response
  }

  const refreshed = await refreshAccessToken()
  if (!refreshed) {
    logout()
    return response
  }

  return fetchWithToken(base.clone())
}

function fetchWithToken(request: Request): Promise<Response> {
  const token = useAuthStore.getState().accessToken
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(request)
}
