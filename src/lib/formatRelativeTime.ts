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
