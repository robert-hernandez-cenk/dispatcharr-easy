import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import App from './App'

function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  )
}

describe('App', () => {
  it('renders the app title', () => {
    renderApp()
    expect(
      screen.getByRole('heading', { name: 'Dispatcharr Easy' }),
    ).toBeInTheDocument()
  })
})
