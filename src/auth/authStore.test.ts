import { describe, it, expect, beforeEach } from 'vitest'
import {
  useAuthStore,
  getStoredRefreshToken,
  REFRESH_TOKEN_KEY,
} from './authStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ accessToken: null, isAuthenticated: false })
  })

  it('starts unauthenticated', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('setTokens stores the access token in memory and the refresh token in localStorage', () => {
    useAuthStore
      .getState()
      .setTokens({ access: 'access-1', refresh: 'refresh-1' })

    expect(useAuthStore.getState().accessToken).toBe('access-1')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(getStoredRefreshToken()).toBe('refresh-1')
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1')
  })

  it('setTokens without a refresh token leaves the stored refresh token untouched', () => {
    useAuthStore
      .getState()
      .setTokens({ access: 'access-1', refresh: 'refresh-1' })
    useAuthStore.getState().setTokens({ access: 'access-2' })

    expect(useAuthStore.getState().accessToken).toBe('access-2')
    expect(getStoredRefreshToken()).toBe('refresh-1')
  })

  it('clear removes the access token and the stored refresh token', () => {
    useAuthStore
      .getState()
      .setTokens({ access: 'access-1', refresh: 'refresh-1' })

    useAuthStore.getState().clear()

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(getStoredRefreshToken()).toBeNull()
  })
})
