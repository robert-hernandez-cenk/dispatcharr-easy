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

export function SourceHealthCard({
  name,
  status,
  lastMessage,
  updatedAt,
}: SourceHealthCardProps) {
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
