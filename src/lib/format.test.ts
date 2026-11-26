import { describe, expect, it } from 'vitest'
import {
  APP_LOCALE,
  formatDate,
  formatDateTime,
  formatDateTimeZone,
  formatNumber,
} from './format'

describe('format', () => {
  it('APP_LOCALE is en-US', () => {
    expect(APP_LOCALE).toBe('en-US')
  })

  it('formatDate renders month-first medium date', () => {
    expect(formatDate('2026-01-05T12:00:00Z')).toBe('Jan 5, 2026')
    expect(formatDate(new Date('2026-01-05T12:00:00Z'))).toBe('Jan 5, 2026')
  })

  it('formatDateTime includes date and short time', () => {
    expect(formatDateTime('2026-01-05T12:00:00Z')).toMatch(
      /^Jan 5, 2026, \d{1,2}:\d{2}\s?[AP]M$/
    )
  })

  it('formatDateTimeZone appends a time zone name', () => {
    const out = formatDateTimeZone('2026-01-05T12:00:00Z')
    expect(out.startsWith('Jan 5, 2026')).toBe(true)
    expect(out).toMatch(/\S+$/)
    expect(out).toMatch(/(UTC|GMT[+-]?\d*|[A-Z]{2,5})$/)
  })

  it('formatNumber groups thousands with commas', () => {
    expect(formatNumber(1284)).toBe('1,284')
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(0)).toBe('0')
  })
})
