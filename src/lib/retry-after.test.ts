import { describe, expect, it } from 'vitest'
import { formatRetryAfter } from './retry-after'

describe('formatRetryAfter', () => {
  it('formats seconds, minutes, hours and unknown', () => {
    expect(formatRetryAfter(30)).toBe('30 s')
    expect(formatRetryAfter(90)).toBe('2 min')
    expect(formatRetryAfter(7200)).toBe('2 h')
    expect(formatRetryAfter(undefined)).toBe('a few minutes')
  })
})
