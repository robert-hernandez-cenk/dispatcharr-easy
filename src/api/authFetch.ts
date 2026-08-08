import { useAuthStore } from '../auth/authStore'
import { refreshAccessToken, logout } from '../auth/authClient'

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetchWithToken(input, init)
  if (response.status !== 401) {
    return response
  }

  const refreshed = await refreshAccessToken()
  if (!refreshed) {
    logout()
    return response
  }

  return fetchWithToken(input, init)
}

function fetchWithToken(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { ...init, headers })
}
