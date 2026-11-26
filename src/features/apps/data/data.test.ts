import { expect, test } from 'vitest'
import { formatDate } from './data'

test('formatDate returns em dash for null and en-US date otherwise', () => {
  expect(formatDate(null)).toBe('—')
  expect(formatDate('2026-03-20T12:00:00Z')).toBe('Mar 20, 2026')
})
