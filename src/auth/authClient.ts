import { useAuthStore, getStoredRefreshToken } from './authStore'

interface TokenPairResponse {
  access: string
  refresh: string
}

interface AccessTokenResponse {
  access: string
}

export async function login(username: string, password: string): Promise<boolean> {
  const response = await fetch('/api/accounts/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    return false
  }
  const tokens = (await response.json()) as TokenPairResponse
  useAuthStore.getState().setTokens(tokens)
  return true
}

let refreshInFlight: Promise<boolean> | null = null

export function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function performRefresh(): Promise<boolean> {
  const refresh = getStoredRefreshToken()
  if (!refresh) {
    return false
  }
  const response = await fetch('/api/accounts/token/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!response.ok) {
    return false
  }
  const { access } = (await response.json()) as AccessTokenResponse
  useAuthStore.getState().setTokens({ access })
  return true
}

export function logout(): void {
  useAuthStore.getState().clear()
}
