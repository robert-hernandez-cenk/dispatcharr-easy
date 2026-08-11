# App Shell + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `dispatcharr-easy`'s first real UI — a login screen, a responsive app shell, and a Dashboard page that renders live data (channel/stream counts, M3U/EPG source health) from a real Dispatcharr instance — proving Foundation's auth + typed-API-client layer works end-to-end.

**Architecture:** A single `AuthGate` component (not per-route guards) gates the one protected route. On boot it attempts a silent refresh if a refresh token is stored, then either renders the app or redirects to `/login`; it also redirects if `isAuthenticated` later flips to `false` (e.g. a failed background refresh after 401). `react-router-dom` v7 in declarative mode (`BrowserRouter`/`Routes`/`Route`) with exactly two routes: `/login` and `/` (Dashboard, wrapped in `AuthGate` + a Mantine `AppShell`-based layout). The Dashboard fetches four independent pieces of data in parallel and is partial-failure tolerant — one failed request doesn't blank the page.

**Tech Stack:** Adds `react-router-dom` 7.18.2 and `@mantine/form` 8.3.18 to Foundation's existing stack (Vite 8, React 19, TypeScript ~6.0, Mantine 8.3.18, Zustand 5, Vitest 4 + RTL 16).

## Global Constraints

- **No Dispatcharr source in this repo** — API-only, per Foundation's constraint.
- **Public repo** — never commit secrets, credentials, or a private instance URL.
- **Mantine 8** (not 9) — already pinned; this plan adds `@mantine/form` at the matching `8.3.18`.
- **Nav scope: minimal.** The navbar shows only a "Dashboard" link + user menu. No placeholder entries for Channels/EPG/VOD/etc. — those are added by whichever future plan builds each page.
- **No active-connections / WebSocket data in this plan.** There is no REST endpoint for it (confirmed against the live schema); it's Django-Channels/WebSocket-only. Deferred to whichever later plan first needs live data.
- **No `@mantine/notifications` in this plan.** Every error in this plan is scoped/inline (login form error, per-section Dashboard alert) — no feature here needs a global toast. Add it in a later plan when one actually does.
- **Auth gating: single `AuthGate`, not route-level guards.** Two total routes today makes route-level guards premature; `AuthGate` wraps the one protected route (`/`) directly, functionally covering the whole app since it's the only protected page.
- **Mobile-first.** `AppShell` navbar collapses off-canvas below the `sm` breakpoint via a burger toggle. Nothing in this plan should assume a desktop-only viewport.
- **API shapes below are confirmed against the real, committed `src/api/schema.d.ts`** (generated from a live instance in Foundation's Task 6) — not guessed. Endpoints used: `GET /api/channels/channels/?page_size=1` and `GET /api/channels/streams/?page_size=1` (both return DRF pagination `{count, next, previous, results}`), `GET /api/m3u/accounts/` (returns `M3UAccount[]`), `GET /api/epg/sources/` (returns `EPGSource[]`), `GET /api/accounts/users/me/` (returns `User`, has `username`). `M3UAccountStatusEnum` = `"idle" | "fetching" | "parsing" | "error" | "success" | "pending_setup" | "disabled"`; `EPGSourceStatusEnum` = `"idle" | "fetching" | "parsing" | "error" | "success" | "disabled"`.

---

## File structure

```
dispatcharr-easy/
└── src/
    ├── App.tsx                        # MODIFY: BrowserRouter + AppRoutes (was the Phase 0 placeholder)
    ├── App.test.tsx                   # MODIFY: integration test (unauthenticated -> /login)
    ├── router.tsx                     # NEW: route definitions
    ├── lib/
    │   ├── formatRelativeTime.ts      # NEW
    │   └── formatRelativeTime.test.ts
    ├── auth/
    │   ├── AuthGate.tsx                # NEW
    │   ├── AuthGate.test.tsx
    │   ├── authStore.ts                # unchanged (Foundation)
    │   └── authClient.ts               # unchanged (Foundation)
    ├── components/
    │   ├── AppLayout.tsx               # NEW
    │   ├── AppLayout.test.tsx
    │   ├── StatTile.tsx                # NEW
    │   ├── StatTile.test.tsx
    │   ├── SourceHealthCard.tsx        # NEW
    │   └── SourceHealthCard.test.tsx
    └── pages/
        ├── LoginPage.tsx                # NEW
        ├── LoginPage.test.tsx
        ├── DashboardPage.tsx            # NEW
        └── DashboardPage.test.tsx
```

Later plans add `src/pages/` entries for Channels/EPG/VOD/etc. and grow `AppLayout`'s navbar — none of that is in scope here.

---

## Task 1: Install routing + form dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `react-router-dom` and `@mantine/form` available for import in every later task.

- [ ] **Step 1: Install**

```bash
npm install react-router-dom@^7.18.2 @mantine/form@^8.3.18
```

- [ ] **Step 2: Verify**

```bash
npm run build
npm run test
```

Expected: both exit 0 (nothing imports the new packages yet, so this just confirms the install didn't break anything).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add react-router-dom and @mantine/form"
```

---

## Task 2: `formatRelativeTime` utility

**Files:**
- Create: `src/lib/formatRelativeTime.ts`, `src/lib/formatRelativeTime.test.ts`

**Interfaces:**
- Produces: `formatRelativeTime(isoDate: string | null, now?: Date): string`. Task's `SourceHealthCard` (Task 4) imports this by exact name.

- [ ] **Step 1: Write the failing test**

Write `src/lib/formatRelativeTime.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime'

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-08T20:00:00Z')

  it('returns "never" for null', () => {
    expect(formatRelativeTime(null, now)).toBe('never')
  })

  it('returns "never" for an unparseable date', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('never')
  })

  it('formats a time a few minutes ago', () => {
    expect(formatRelativeTime('2026-08-08T19:55:00Z', now)).toBe('5 minutes ago')
  })

  it('formats a time a few hours ago', () => {
    expect(formatRelativeTime('2026-08-08T17:00:00Z', now)).toBe('3 hours ago')
  })

  it('formats a time a few days ago', () => {
    expect(formatRelativeTime('2026-08-05T20:00:00Z', now)).toBe('3 days ago')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/formatRelativeTime.test.ts
```

Expected: fails with "Cannot find module './formatRelativeTime'".

- [ ] **Step 3: Implement**

Write `src/lib/formatRelativeTime.ts`:

```ts
export function formatRelativeTime(isoDate: string | null, now: Date = new Date()): string {
  if (!isoDate) {
    return 'never'
  }

  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return 'never'
  }

  const diffMs = date.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / 60_000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute')
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour')
  }

  const diffDays = Math.round(diffHours / 24)
  return rtf.format(diffDays, 'day')
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/formatRelativeTime.test.ts
```

Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formatRelativeTime.ts src/lib/formatRelativeTime.test.ts
git commit -m "Add formatRelativeTime utility"
```

---

## Task 3: `StatTile` component

**Files:**
- Create: `src/components/StatTile.tsx`, `src/components/StatTile.test.tsx`

**Interfaces:**
- Produces: `StatTile({ label: string, value: number | null })` — default export is NOT used, this is a named export `StatTile`. Task 8 (`DashboardPage`) imports it by this exact name.

- [ ] **Step 1: Write the failing test**

Write `src/components/StatTile.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/StatTile.test.tsx
```

Expected: fails with "Cannot find module './StatTile'".

- [ ] **Step 3: Implement**

Write `src/components/StatTile.tsx`:

```tsx
import { Paper, Text } from '@mantine/core'

export interface StatTileProps {
  label: string
  value: number | null
}

export function StatTile({ label, value }: StatTileProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xl" fw={700}>
        {value ?? '—'}
      </Text>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
    </Paper>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/StatTile.test.tsx
```

Expected: 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/StatTile.tsx src/components/StatTile.test.tsx
git commit -m "Add StatTile component"
```

---

## Task 4: `SourceHealthCard` component

**Files:**
- Create: `src/components/SourceHealthCard.tsx`, `src/components/SourceHealthCard.test.tsx`

**Interfaces:**
- Consumes: `formatRelativeTime` from `../lib/formatRelativeTime` (Task 2).
- Produces: `SourceHealthCard({ name: string, status: string, lastMessage: string | null, updatedAt: string | null })` — named export `SourceHealthCard`. Deliberately typed with plain strings, not `M3UAccount`/`EPGSource` schema types, so it stays independently testable and schema-agnostic. Task 8 (`DashboardPage`) imports it by this exact name and maps schema types onto these props.

- [ ] **Step 1: Write the failing test**

Write `src/components/SourceHealthCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { SourceHealthCard, type SourceHealthCardProps } from './SourceHealthCard'

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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/SourceHealthCard.test.tsx
```

Expected: fails with "Cannot find module './SourceHealthCard'".

- [ ] **Step 3: Implement**

Write `src/components/SourceHealthCard.tsx`:

```tsx
import { Badge, Group, Paper, Text } from '@mantine/core'
import { formatRelativeTime } from '../lib/formatRelativeTime'

export interface SourceHealthCardProps {
  name: string
  status: string
  lastMessage: string | null
  updatedAt: string | null
}

const STATUS_COLORS: Record<string, string> = {
  success: 'green',
  error: 'red',
  fetching: 'blue',
  parsing: 'blue',
  idle: 'gray',
  pending_setup: 'gray',
  disabled: 'gray',
}

export function SourceHealthCard({ name, status, lastMessage, updatedAt }: SourceHealthCardProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between">
        <Text fw={500}>{name}</Text>
        <Badge color={STATUS_COLORS[status] ?? 'gray'}>{status}</Badge>
      </Group>
      {lastMessage && (
        <Text size="sm" c="dimmed" mt={4}>
          {lastMessage}
        </Text>
      )}
      <Text size="xs" c="dimmed" mt={4}>
        Updated {formatRelativeTime(updatedAt)}
      </Text>
    </Paper>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/SourceHealthCard.test.tsx
```

Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/SourceHealthCard.tsx src/components/SourceHealthCard.test.tsx
git commit -m "Add SourceHealthCard component"
```

---

## Task 5: `AuthGate` component

**Files:**
- Create: `src/auth/AuthGate.tsx`, `src/auth/AuthGate.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore`, `getStoredRefreshToken`, `REFRESH_TOKEN_KEY` from `./authStore` (Foundation); `refreshAccessToken` from `./authClient` (Foundation); `useNavigate` from `react-router-dom` (Task 1).
- Produces: `AuthGate({ children: React.ReactNode })` — named export. Task 9 (router wiring) wraps the `/` route's element with this by exact name.

`AuthGate` must be rendered under a Router context (`BrowserRouter`/`MemoryRouter`) since it calls `useNavigate()`.

- [ ] **Step 1: Write the failing tests**

Write `src/auth/AuthGate.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuthStore, REFRESH_TOKEN_KEY } from './authStore'
import { AuthGate } from './AuthGate'

vi.mock('./authClient', () => ({
  refreshAccessToken: vi.fn(),
}))
import { refreshAccessToken } from './authClient'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderGate() {
  return render(
    <MemoryRouter>
      <AuthGate>
        <div>protected content</div>
      </AuthGate>
    </MemoryRouter>,
  )
}

describe('AuthGate', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ accessToken: null, isAuthenticated: false })
    mockNavigate.mockReset()
    vi.mocked(refreshAccessToken).mockReset()
  })

  it('renders children when already authenticated', async () => {
    useAuthStore.setState({ accessToken: 'a1', isAuthenticated: true })
    renderGate()

    expect(await screen.findByText('protected content')).toBeInTheDocument()
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('redirects to /login with no stored session, without attempting a refresh', async () => {
    renderGate()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true }))
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
  })

  it('attempts a silent refresh when a refresh token is stored, then renders children on success', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'r1')
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      useAuthStore.setState({ accessToken: 'a2', isAuthenticated: true })
      return true
    })
    renderGate()

    expect(await screen.findByText('protected content')).toBeInTheDocument()
    expect(refreshAccessToken).toHaveBeenCalledOnce()
  })

  it('redirects to /login when the silent refresh fails', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'r1')
    vi.mocked(refreshAccessToken).mockResolvedValue(false)
    renderGate()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true }))
  })

  it('redirects to /login if isAuthenticated later flips to false (e.g. a failed background refresh)', async () => {
    useAuthStore.setState({ accessToken: 'a1', isAuthenticated: true })
    renderGate()
    expect(await screen.findByText('protected content')).toBeInTheDocument()

    useAuthStore.setState({ accessToken: null, isAuthenticated: false })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true }))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/auth/AuthGate.test.tsx
```

Expected: fails with "Cannot find module './AuthGate'".

- [ ] **Step 3: Implement**

Write `src/auth/AuthGate.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Center, Loader } from '@mantine/core'
import { useAuthStore, getStoredRefreshToken } from './authStore'
import { refreshAccessToken } from './authClient'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!useAuthStore.getState().isAuthenticated && getStoredRefreshToken()) {
        await refreshAccessToken()
      }
      if (!cancelled) {
        setChecked(true)
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (checked && !isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [checked, isAuthenticated, navigate])

  if (!checked) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/auth/AuthGate.test.tsx
```

Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/AuthGate.tsx src/auth/AuthGate.test.tsx
git commit -m "Add AuthGate component"
```

---

## Task 6: `LoginPage`

**Files:**
- Create: `src/pages/LoginPage.tsx`, `src/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `login` from `../auth/authClient` (Foundation); `useForm` from `@mantine/form` (Task 1); `useNavigate` from `react-router-dom`.
- Produces: `LoginPage()` — named export, default-exports nothing. Renders a heading with the accessible name **"Log in"** exactly (Task 9's `App.test.tsx` integration test and Task 5's `AuthGate` redirect flow both rely on this page being reachable at `/login` with this exact heading text).

- [ ] **Step 1: Write the failing tests**

Write `src/pages/LoginPage.test.tsx`:

```tsx
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

    expect(await screen.findByText('Incorrect username or password.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/pages/LoginPage.test.tsx
```

Expected: fails with "Cannot find module './LoginPage'".

- [ ] **Step 3: Implement**

Write `src/pages/LoginPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Center, Paper, PasswordInput, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { login } from '../auth/authClient'

interface LoginFormValues {
  username: string
  password: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<LoginFormValues>({
    initialValues: { username: '', password: '' },
    validate: {
      username: (value) => (value.trim() ? null : 'Username is required'),
      password: (value) => (value ? null : 'Password is required'),
    },
  })

  async function handleSubmit(values: LoginFormValues) {
    setError(null)
    setSubmitting(true)
    const ok = await login(values.username, values.password)
    setSubmitting(false)

    if (ok) {
      navigate('/', { replace: true })
    } else {
      setError('Incorrect username or password.')
    }
  }

  return (
    <Center h="100vh">
      <Paper withBorder shadow="md" p="xl" w={360}>
        <Title order={2} mb="md">
          Log in
        </Title>
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput label="Username" {...form.getInputProps('username')} />
          <PasswordInput label="Password" mt="sm" {...form.getInputProps('password')} />
          {error && (
            <Text c="red" size="sm" mt="sm">
              {error}
            </Text>
          )}
          <Button type="submit" fullWidth mt="lg" loading={submitting}>
            Log in
          </Button>
        </form>
      </Paper>
    </Center>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/pages/LoginPage.test.tsx
```

Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx
git commit -m "Add LoginPage"
```

---

## Task 7: `AppLayout`

**Files:**
- Create: `src/components/AppLayout.tsx`, `src/components/AppLayout.test.tsx`

**Interfaces:**
- Consumes: `apiClient` from `../api/client` (Foundation); `logout` from `../auth/authClient` (Foundation); `useDisclosure` from `@mantine/hooks` (Foundation); `useMantineColorScheme` from `@mantine/core`; `Link` from `react-router-dom`.
- Produces: `AppLayout({ children: React.ReactNode })` — named export. Task 9 wraps `DashboardPage` with it.

No new dependency for icons — the color-scheme toggle uses plain emoji characters, a deliberate simplification for Phase 0 (not a placeholder to "fix later"; revisit only if/when this project adopts an icon library for other reasons).

- [ ] **Step 1: Write the failing tests**

Write `src/components/AppLayout.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'

vi.mock('../api/client', () => ({
  apiClient: { GET: vi.fn() },
}))
vi.mock('../auth/authClient', () => ({
  logout: vi.fn(),
}))
import { apiClient } from '../api/client'
import { logout } from '../auth/authClient'

function renderLayout() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <AppLayout>
          <div>page content</div>
        </AppLayout>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.mocked(apiClient.GET).mockReset()
    vi.mocked(logout).mockReset()
  })

  it('renders its children', () => {
    vi.mocked(apiClient.GET).mockResolvedValue({ data: undefined, error: undefined } as never)
    renderLayout()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })

  it('shows the current username once loaded', async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { id: 1, username: 'rchernan' },
      error: undefined,
    } as never)
    renderLayout()
    expect(await screen.findByText('rchernan')).toBeInTheDocument()
  })

  it('logs out when "Log out" is clicked', async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { id: 1, username: 'rchernan' },
      error: undefined,
    } as never)
    const user = userEvent.setup()
    renderLayout()

    await user.click(await screen.findByText('rchernan'))
    await user.click(screen.getByText('Log out'))

    expect(logout).toHaveBeenCalledOnce()
  })

  it('toggles the color-scheme icon when clicked', async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({ data: undefined, error: undefined } as never)
    const user = userEvent.setup()
    renderLayout()

    const toggle = screen.getByRole('button', { name: 'Toggle color scheme' })
    const initialLabel = toggle.textContent
    await user.click(toggle)
    expect(toggle.textContent).not.toBe(initialLabel)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/AppLayout.test.tsx
```

Expected: fails with "Cannot find module './AppLayout'".

- [ ] **Step 3: Implement**

Write `src/components/AppLayout.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  Menu,
  NavLink,
  Text,
  Title,
  UnstyledButton,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { apiClient } from '../api/client'
import { logout } from '../auth/authClient'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure()
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient.GET('/api/accounts/users/me/').then(({ data }) => {
      if (!cancelled && data) {
        setUsername(data.username)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleColorScheme() {
    setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={3}>Dispatcharr Easy</Title>
          </Group>
          <Group>
            <ActionIcon variant="default" onClick={toggleColorScheme} aria-label="Toggle color scheme">
              {colorScheme === 'dark' ? '☀️' : '🌙'}
            </ActionIcon>
            <Menu>
              <Menu.Target>
                <UnstyledButton>
                  <Text size="sm">{username ?? '…'}</Text>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={logout}>Log out</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <NavLink component={Link} to="/" label="Dashboard" active />
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/AppLayout.test.tsx
```

Expected: 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppLayout.tsx src/components/AppLayout.test.tsx
git commit -m "Add AppLayout"
```

---

## Task 8: `DashboardPage`

**Files:**
- Create: `src/pages/DashboardPage.tsx`, `src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `apiClient` from `../api/client` (Foundation); `StatTile` from `../components/StatTile` (Task 3); `SourceHealthCard` from `../components/SourceHealthCard` (Task 4); `components` (schema types) from `../api/schema` (Foundation).
- Produces: `DashboardPage()` — named export. Task 9 renders it inside `AppLayout` inside `AuthGate`.

- [ ] **Step 1: Write the failing tests**

Write `src/pages/DashboardPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DashboardPage } from './DashboardPage'

vi.mock('../api/client', () => ({
  apiClient: { GET: vi.fn() },
}))
import { apiClient } from '../api/client'

function renderPage() {
  return render(
    <MantineProvider>
      <DashboardPage />
    </MantineProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.GET).mockReset()
  })

  it('renders stat tiles and source health cards once data loads', async () => {
    vi.mocked(apiClient.GET).mockImplementation(async (path: string) => {
      if (path === '/api/channels/channels/') return { data: { count: 1369 }, error: undefined } as never
      if (path === '/api/channels/streams/') return { data: { count: 36389 }, error: undefined } as never
      if (path === '/api/m3u/accounts/') {
        return {
          data: [
            {
              id: 1,
              name: 'https://trilo.tv',
              status: 'success',
              last_message: 'Processing completed',
              updated_at: '2026-08-08T19:31:55Z',
            },
          ],
          error: undefined,
        } as never
      }
      if (path === '/api/epg/sources/') {
        return {
          data: [
            {
              id: 1,
              name: 'https://trilo.tv',
              status: 'success',
              last_message: 'Parsed 539 programs',
              updated_at: '2026-08-08T19:25:56Z',
            },
          ],
          error: undefined,
        } as never
      }
      throw new Error(`unexpected path ${path}`)
    })

    renderPage()

    expect(await screen.findByText('1369')).toBeInTheDocument()
    expect(screen.getByText('36389')).toBeInTheDocument()
    expect(screen.getAllByText('https://trilo.tv')).toHaveLength(2)
  })

  it('shows a scoped error when EPG sources fail to load, without blocking the rest of the page', async () => {
    vi.mocked(apiClient.GET).mockImplementation(async (path: string) => {
      if (path === '/api/channels/channels/') return { data: { count: 1369 }, error: undefined } as never
      if (path === '/api/channels/streams/') return { data: { count: 36389 }, error: undefined } as never
      if (path === '/api/m3u/accounts/') return { data: [], error: undefined } as never
      if (path === '/api/epg/sources/') return { data: undefined, error: { detail: 'boom' } } as never
      throw new Error(`unexpected path ${path}`)
    })

    renderPage()

    expect(await screen.findByText('1369')).toBeInTheDocument()
    expect(screen.getByText('Failed to load EPG sources.')).toBeInTheDocument()
    expect(screen.getByText('No M3U accounts configured.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/pages/DashboardPage.test.tsx
```

Expected: fails with "Cannot find module './DashboardPage'".

- [ ] **Step 3: Implement**

Write `src/pages/DashboardPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Alert, Center, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { apiClient } from '../api/client'
import type { components } from '../api/schema'
import { StatTile } from '../components/StatTile'
import { SourceHealthCard } from '../components/SourceHealthCard'

type M3UAccount = components['schemas']['M3UAccount']
type EPGSource = components['schemas']['EPGSource']

async function fetchChannelCount(): Promise<number | null> {
  try {
    const { data, error } = await apiClient.GET('/api/channels/channels/', {
      params: { query: { page_size: 1 } },
    })
    if (error || !data) return null
    return data.count
  } catch {
    return null
  }
}

async function fetchStreamCount(): Promise<number | null> {
  try {
    const { data, error } = await apiClient.GET('/api/channels/streams/', {
      params: { query: { page_size: 1 } },
    })
    if (error || !data) return null
    return data.count
  } catch {
    return null
  }
}

async function fetchM3UAccounts(): Promise<M3UAccount[] | null> {
  try {
    const { data, error } = await apiClient.GET('/api/m3u/accounts/')
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

async function fetchEPGSources(): Promise<EPGSource[] | null> {
  try {
    const { data, error } = await apiClient.GET('/api/epg/sources/')
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

export function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [channelCount, setChannelCount] = useState<number | null>(null)
  const [streamCount, setStreamCount] = useState<number | null>(null)
  const [m3uAccounts, setM3uAccounts] = useState<M3UAccount[] | null>(null)
  const [epgSources, setEpgSources] = useState<EPGSource[] | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([fetchChannelCount(), fetchStreamCount(), fetchM3UAccounts(), fetchEPGSources()]).then(
      ([channels, streams, m3u, epg]) => {
        if (cancelled) return
        setChannelCount(channels)
        setStreamCount(streams)
        setM3uAccounts(m3u)
        setEpgSources(epg)
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }

  return (
    <Stack gap="xl">
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <StatTile label="Channels" value={channelCount} />
        <StatTile label="Streams" value={streamCount} />
      </SimpleGrid>

      <div>
        <Title order={3} mb="sm">
          M3U sources
        </Title>
        {m3uAccounts === null ? (
          <Alert color="red">Failed to load M3U sources.</Alert>
        ) : m3uAccounts.length === 0 ? (
          <Text c="dimmed">No M3U accounts configured.</Text>
        ) : (
          <Stack gap="sm">
            {m3uAccounts.map((account) => (
              <SourceHealthCard
                key={account.id}
                name={account.name}
                status={account.status ?? 'idle'}
                lastMessage={account.last_message ?? null}
                updatedAt={account.updated_at ?? null}
              />
            ))}
          </Stack>
        )}
      </div>

      <div>
        <Title order={3} mb="sm">
          EPG sources
        </Title>
        {epgSources === null ? (
          <Alert color="red">Failed to load EPG sources.</Alert>
        ) : epgSources.length === 0 ? (
          <Text c="dimmed">No EPG sources configured.</Text>
        ) : (
          <Stack gap="sm">
            {epgSources.map((source) => (
              <SourceHealthCard
                key={source.id}
                name={source.name}
                status={source.status ?? 'idle'}
                lastMessage={source.last_message ?? null}
                updatedAt={source.updated_at ?? null}
              />
            ))}
          </Stack>
        )}
      </div>
    </Stack>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/pages/DashboardPage.test.tsx
```

Expected: 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx src/pages/DashboardPage.test.tsx
git commit -m "Add DashboardPage"
```

---

## Task 9: Router + `App.tsx` wiring

**Files:**
- Create: `src/router.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `AuthGate` (Task 5), `AppLayout` (Task 7), `LoginPage` (Task 6), `DashboardPage` (Task 8), `useAuthStore` (Foundation).
- Produces: the app's actual route tree — this is the final integration point where every earlier task's component gets wired together and rendered for real.

This task is integration, not new logic — every piece was already unit-tested in its own task. Its own test is one end-to-end-flavored RTL test proving the pieces work together: an unauthenticated visit lands on the login page.

- [ ] **Step 1: Write the router**

Write `src/router.tsx`:

```tsx
import { Route, Routes } from 'react-router-dom'
import { AuthGate } from './auth/AuthGate'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <AuthGate>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </AuthGate>
        }
      />
    </Routes>
  )
}
```

- [ ] **Step 2: Write the failing integration test**

Replace `src/App.test.tsx` (the old test asserted on the "Dispatcharr Easy" placeholder heading, which is about to stop being what `App` renders):

```tsx
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

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })
})
```

This scenario needs no `fetch` mocking: with no refresh token in `localStorage`, `AuthGate` skips calling `refreshAccessToken()` entirely (per Task 5's implementation) and redirects straight to `/login`, so no network call happens.

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/App.test.tsx
```

Expected: fails — the old `App.tsx` still renders the "Dispatcharr Easy" placeholder directly, with no router and no "Log in" heading anywhere.

- [ ] **Step 4: Replace the placeholder `App.tsx`**

Write `src/App.tsx`:

```tsx
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './router'

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/App.test.tsx
```

Expected: 1 test passed.

- [ ] **Step 6: Run the full suite and build**

```bash
npm run test
npm run lint
npm run format:check
npm run build
```

Expected: all four exit 0. This is the first point where every component from Tasks 2-9 is imported together — if any prop/type mismatch slipped through individual task reviews, `tsc -b` (via `npm run build`) surfaces it here.

- [ ] **Step 7: Commit**

```bash
git add src/router.tsx src/App.tsx src/App.test.tsx
git commit -m "Wire up router, AuthGate, and AppLayout in App.tsx"
```

---

## Task 10: Manual smoke check against a real instance

Not automated — same rationale as Foundation's Task 11: this is the one thing that actually touches a live remote system, verified manually.

- [ ] **Step 1: Start the dev server against your real instance**

```bash
DISPATCHARR_DEV_PROXY_TARGET=<your-instance-base-url> npm run dev
```

(Or set it in `.env.local`, copied from `.env.local.example` per Foundation's Task 6.)

- [ ] **Step 2: Log in through the real UI**

Open the dev server URL in a browser. Confirm:
- An unauthenticated visit shows the Login page (not a blank screen or crash).
- Logging in with real credentials navigates to `/` and shows the Dashboard.
- The Dashboard's stat tiles show real channel/stream counts (not `—`).
- The Dashboard's M3U/EPG source sections show real source names, status badges, and "Updated ... ago" text (not "Failed to load" or "No ... configured" unless that's actually true for your instance).

- [ ] **Step 3: Confirm the auth-expiry path doesn't crash**

In the browser devtools console, clear the in-memory access token to simulate an expired session:

```js
// Not a real API — this just documents the manual check. Reload the page after
// clearing localStorage's refresh token to simulate "no session":
localStorage.removeItem('dispatcharr-easy:refreshToken')
```

Reload the page. Confirm it redirects to `/login` rather than showing a blank page or an unhandled error.

- [ ] **Step 4: Check mobile layout**

Resize the browser (or use devtools' device toolbar) below Mantine's `sm` breakpoint (~768px). Confirm the navbar collapses off-canvas and the burger icon in the header opens/closes it. Confirm the Dashboard's stat tiles reflow to fewer columns rather than overflowing horizontally.

- [ ] **Step 5: Record the result**

No commit needed — this task produces no repo changes. If any step didn't match the expected behavior, stop and reconcile before considering this plan complete.

---

## Self-review notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-08-app-shell-dashboard-design.md` maps to a task — routing/auth gating (Task 5, 9), Login (Task 6), AppLayout/nav/theming/mobile (Task 7), Dashboard stat tiles + source health + partial-failure tolerance (Task 3, 4, 8), manual end-to-end proof (Task 10). The design's explicit non-goals (active connections/WebSocket, full nav, route-level guards, `@mantine/notifications`) are honored — none of them appear anywhere in this plan.
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every step has literal file contents or literal commands with expected output.
- **Type consistency:** `AuthGate`'s `children: React.ReactNode` prop matches how Task 9 uses it. `AppLayout`'s `children: React.ReactNode` matches Task 9's usage. `SourceHealthCard`'s props (`name`, `status`, `lastMessage`, `updatedAt`) are used identically in Task 8's two call sites (M3U accounts, EPG sources) and match `SourceHealthCardProps` defined in Task 4. `StatTile`'s `value: number | null` matches the `number | null` return type of Task 8's `fetchChannelCount`/`fetchStreamCount`. `formatRelativeTime`'s signature (`isoDate: string | null, now?: Date`) is used correctly by `SourceHealthCard` (single-arg call, relying on the `now` default).
