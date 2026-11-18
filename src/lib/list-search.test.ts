import { describe, expect, it } from 'vitest'
import { SEARCH_MAX, searchTermSchema, toSearchTerm } from './list-search'

describe('searchTermSchema', () => {
  it("trims; '' / '   ' / 101 chars -> undefined; number 123 -> '123'; non-string -> undefined", () => {
    expect(searchTermSchema.parse('  acme ')).toBe('acme')
    expect(searchTermSchema.parse('')).toBeUndefined()
    expect(searchTermSchema.parse('   ')).toBeUndefined()
    expect(searchTermSchema.parse('a'.repeat(SEARCH_MAX))).toHaveLength(
      SEARCH_MAX
    )
    expect(searchTermSchema.parse('a'.repeat(SEARCH_MAX + 1))).toBeUndefined()
    expect(searchTermSchema.parse(123)).toBe('123')
    expect(searchTermSchema.parse(true)).toBeUndefined()
    expect(searchTermSchema.parse({})).toBeUndefined()
    expect(searchTermSchema.parse(undefined)).toBeUndefined()
  })
})

describe('toSearchTerm', () => {
  it('NFC + trim; whitespace -> undefined', () => {
    expect(toSearchTerm('  Café ')).toBe('Café')
    expect(toSearchTerm('   ')).toBeUndefined()
    expect(toSearchTerm('')).toBeUndefined()
    expect(toSearchTerm(undefined)).toBeUndefined()
  })
})
