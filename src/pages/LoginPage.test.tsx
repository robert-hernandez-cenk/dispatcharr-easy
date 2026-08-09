import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'

vi.mock('../auth/authClient', () => ({
  login: vi.fn(),
}))
import { login } from '../auth/authClient'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    vi.mocked(login).mockReset()
  })

  it('renders a "Log in" heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('navigates to / on successful login', async () => {
    vi.mocked(login).mockResolvedValue(true)
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Username'), 'rchernan')
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(login).toHaveBeenCalledWith('rchernan', 'correct-password')
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('shows an inline error on failed login and does not navigate', async () => {
    vi.mocked(login).mockResolvedValue(false)
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Username'), 'rchernan')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(
      await screen.findByText('Incorrect username or password.'),
    ).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
