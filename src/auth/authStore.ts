import { create } from 'zustand'

export const REFRESH_TOKEN_KEY = 'dispatcharr-easy:refreshToken'

interface AuthState {
  accessToken: string | null
  isAuthenticated: boolean
  setTokens: (tokens: { access: string; refresh?: string }) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  isAuthenticated: false,
  setTokens: ({ access, refresh }) => {
    if (refresh) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
    }
    set({ accessToken: access, isAuthenticated: true })
  },
  clear: () => {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    set({ accessToken: null, isAuthenticated: false })
  },
}))

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}
