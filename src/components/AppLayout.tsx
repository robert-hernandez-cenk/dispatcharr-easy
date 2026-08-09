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
    apiClient
      .GET('/api/accounts/users/me/')
      .then(({ data }) => {
        if (!cancelled && data) {
          setUsername(data.username)
        }
      })
      .catch(() => {
        // Network failure — username stays null, menu shows the placeholder.
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
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Title order={3}>Dispatcharr Easy</Title>
          </Group>
          <Group>
            <ActionIcon
              variant="default"
              onClick={toggleColorScheme}
              aria-label="Toggle color scheme"
            >
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
