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
    expect(formatRelativeTime('2026-08-08T19:55:00Z', now)).toBe(
      '5 minutes ago',
    )
  })

  it('formats a time a few hours ago', () => {
    expect(formatRelativeTime('2026-08-08T17:00:00Z', now)).toBe('3 hours ago')
  })

  it('formats a time a few days ago', () => {
    expect(formatRelativeTime('2026-08-05T20:00:00Z', now)).toBe('3 days ago')
  })
})
