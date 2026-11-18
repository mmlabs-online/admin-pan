import { describe, expect, it } from 'vitest'
import { formatCount, formatMonth } from './format'

describe('formatMonth', () => {
  it('full and tick labels are UTC-safe', () => {
    expect(formatMonth('2026-01', 'full')).toBe('Jan 2026')
    expect(formatMonth('2025-12', 'full')).toBe('Dec 2025')
    expect(formatMonth('2026-03', 'full')).toBe('Mar 2026')
    expect(formatMonth('2026-11', 'tick')).toBe('Nov 26')
  })

  it('returns the input unchanged when it is not YYYY-MM', () => {
    for (const bad of ['2026-13', '2026-1', 'abc', ''])
      expect(formatMonth(bad, 'full')).toBe(bad)
  })
})

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1)).toBe('1')
    expect(formatCount(1284)).toBe('1,284')
    expect(formatCount(1234567)).toBe('1,234,567')
  })
})
