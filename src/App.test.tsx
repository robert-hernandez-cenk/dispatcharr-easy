import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { useAuthStore } from './auth/authStore'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ accessToken: null, isAuthenticated: false })
  })

  it('redirects an unauthenticated visitor to the login page', async () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Log in' }),
    ).toBeInTheDocument()
  })
})
