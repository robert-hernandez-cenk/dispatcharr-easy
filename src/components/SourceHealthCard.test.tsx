import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import {
  SourceHealthCard,
  type SourceHealthCardProps,
} from './SourceHealthCard'

function renderCard(props: Partial<SourceHealthCardProps> = {}) {
  return render(
    <MantineProvider>
      <SourceHealthCard
        name="https://trilo.tv"
        status="success"
        lastMessage="Processing completed"
        updatedAt="2026-08-08T19:31:55Z"
        {...props}
      />
    </MantineProvider>,
  )
}

describe('SourceHealthCard', () => {
  beforeEach(() => cleanup())

  it('renders name, status, and last message', () => {
    renderCard()
    expect(screen.getByText('https://trilo.tv')).toBeInTheDocument()
    expect(screen.getByText('success')).toBeInTheDocument()
    expect(screen.getByText('Processing completed')).toBeInTheDocument()
  })

  it('omits the last-message line when there is none', () => {
    renderCard({ lastMessage: null })
    expect(screen.queryByText('Processing completed')).not.toBeInTheDocument()
  })

  it('renders an unrecognized status as-is rather than crashing', () => {
    renderCard({ status: 'some_future_status' })
    expect(screen.getByText('some_future_status')).toBeInTheDocument()
  })
})
