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
