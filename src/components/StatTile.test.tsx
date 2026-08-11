import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { StatTile } from './StatTile'

function renderTile(value: number | null) {
  return render(
    <MantineProvider>
      <StatTile label="Channels" value={value} />
    </MantineProvider>,
  )
}

describe('StatTile', () => {
  it('renders the value and label', () => {
    renderTile(1369)
    expect(screen.getByText('1369')).toBeInTheDocument()
    expect(screen.getByText('Channels')).toBeInTheDocument()
  })

  it('renders a placeholder when the value failed to load', () => {
    renderTile(null)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
