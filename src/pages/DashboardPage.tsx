import { useEffect, useState } from 'react'
import {
  Alert,
  Center,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
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

    Promise.all([
      fetchChannelCount(),
      fetchStreamCount(),
      fetchM3UAccounts(),
      fetchEPGSources(),
    ]).then(([channels, streams, m3u, epg]) => {
      if (cancelled) return
      setChannelCount(channels)
      setStreamCount(streams)
      setM3uAccounts(m3u)
      setEpgSources(epg)
      setLoading(false)
    })

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
