import { describe, expect, it } from 'vitest'
import { nextApiSort, toSortingState } from './list-sort'

describe('toSortingState', () => {
  it("parses '-x' / 'x' / undefined -> default", () => {
    expect(toSortingState('-name', '-created_at')).toEqual([
      { id: 'name', desc: true },
    ])
    expect(toSortingState('name', '-created_at')).toEqual([
      { id: 'name', desc: false },
    ])
    expect(toSortingState(undefined, '-created_at')).toEqual([
      { id: 'created_at', desc: true },
    ])
    expect(toSortingState(undefined, 'key')).toEqual([
      { id: 'key', desc: false },
    ])
  })
})

describe('nextApiSort', () => {
  const orgDefault = '-created_at'
  it('other column -> asc; asc -> desc; desc -> default (undefined)', () => {
    const created = [{ id: 'created_at', desc: true }]
    expect(
      nextApiSort(created, [{ id: 'name', desc: false }], orgDefault)
    ).toBe('name')
    expect(
      nextApiSort(
        [{ id: 'name', desc: false }],
        [{ id: 'name', desc: true }],
        orgDefault
      )
    ).toBe('-name')
    expect(nextApiSort([{ id: 'name', desc: true }], [], orgDefault)).toBe(
      undefined
    )
  })
  it('the default column (orgs created_at desc) cycles asc <-> default', () => {
    expect(
      nextApiSort([{ id: 'created_at', desc: true }], [], orgDefault)
    ).toBe('created_at')
    expect(
      nextApiSort(
        [{ id: 'created_at', desc: false }],
        [{ id: 'created_at', desc: true }],
        orgDefault
      )
    ).toBeUndefined()
  })
  it("apps key asc -> '-key' -> undefined", () => {
    expect(
      nextApiSort(
        [{ id: 'key', desc: false }],
        [{ id: 'key', desc: true }],
        'key'
      )
    ).toBe('-key')
    expect(nextApiSort([{ id: 'key', desc: true }], [], 'key')).toBeUndefined()
  })
})
