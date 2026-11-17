import { describe, expect, it } from 'vitest'
import {
  actorDisplay,
  describeChanges,
  formatValue,
  isRangeInverted,
  localZoneLabel,
  toAuditRange,
} from './format'

describe('toAuditRange', () => {
  it('from = local midnight, to = next local midnight (exclusive)', () => {
    expect(toAuditRange('2026-11-03', '2026-11-05')).toEqual({
      from: new Date(2026, 10, 3).toISOString(),
      to: new Date(2026, 10, 6).toISOString(),
    })
  })
  it('handles one-sided ranges and no range', () => {
    expect(toAuditRange('2026-11-03')).toEqual({
      from: new Date(2026, 10, 3).toISOString(),
    })
    expect(toAuditRange(undefined, '2026-11-03')).toEqual({
      to: new Date(2026, 10, 4).toISOString(),
    })
    expect(toAuditRange()).toEqual({})
  })
  it('from == to covers one whole local day', () => {
    const { from, to } = toAuditRange('2026-11-03', '2026-11-03')
    expect(new Date(to!).getTime()).toBeGreaterThan(new Date(from!).getTime())
    expect(to).toBe(new Date(2026, 10, 4).toISOString())
  })
  it('rolls over a year end', () => {
    expect(toAuditRange(undefined, '2026-12-31').to).toBe(
      new Date(2027, 0, 1).toISOString()
    )
  })
})

describe('isRangeInverted', () => {
  it('is true only when from > to', () => {
    expect(isRangeInverted('2026-11-05', '2026-11-03')).toBe(true)
    expect(isRangeInverted('2026-11-03', '2026-11-03')).toBe(false)
    expect(isRangeInverted('2026-11-03', '2026-11-05')).toBe(false)
    expect(isRangeInverted('2026-11-03', undefined)).toBe(false)
    expect(isRangeInverted(undefined, undefined)).toBe(false)
  })
})

describe('localZoneLabel', () => {
  it('names the IANA zone and the UTC offset', () => {
    const label = localZoneLabel()
    expect(label).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(label).toMatch(/UTC[+-]\d{2}:\d{2}/)
  })
})

describe('describeChanges', () => {
  it('from/to rows, create (from null), delete (to null), flat map, reason map, null, non-object', () => {
    expect(describeChanges({ name: { from: 'a', to: 'b' } })).toEqual({
      diff: [{ field: 'name', from: 'a', to: 'b' }],
      values: [],
    })
    expect(describeChanges({ name: { from: null, to: 'b' } }).diff).toEqual([
      { field: 'name', from: null, to: 'b' },
    ])
    expect(describeChanges({ name: { from: 'a', to: null } }).diff).toEqual([
      { field: 'name', from: 'a', to: null },
    ])
    expect(describeChanges({ count: 3, ok: true })).toEqual({
      diff: [],
      values: [
        { field: 'count', value: 3 },
        { field: 'ok', value: true },
      ],
    })
    expect(describeChanges({ reason: 'bad_password' }).values).toEqual([
      { field: 'reason', value: 'bad_password' },
    ])
    // not exactly {from, to}: stays a plain value
    expect(describeChanges({ x: { from: 1, to: 2, extra: 3 } }).diff).toEqual(
      []
    )
    // mixed
    const mixed = describeChanges({ s: { from: 1, to: 2 }, n: 5 })
    expect(mixed.diff).toHaveLength(1)
    expect(mixed.values).toEqual([{ field: 'n', value: 5 }])
    for (const v of [null, undefined, 'text', 7, ['a']]) {
      expect(describeChanges(v)).toEqual({ diff: [], values: [] })
    }
  })
})

describe('formatValue', () => {
  it('renders JSON text; null as null; long values are capped', () => {
    expect(formatValue('a')).toBe('"a"')
    expect(formatValue(null)).toBe('null')
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
    const long = formatValue('x'.repeat(600))
    expect(long.length).toBe(501)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('actorDisplay', () => {
  const base = { actor_user_id: null, actor_label: null }
  it('user → short id, system → label, anonymous → Anonymous, unknown kind → raw kind', () => {
    expect(
      actorDisplay({
        actor_kind: 'user',
        actor_user_id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01',
        actor_label: null,
      })
    ).toBe('0b9c6a2e')
    expect(
      actorDisplay({ ...base, actor_kind: 'system', actor_label: 'purge-job' })
    ).toBe('purge-job')
    expect(actorDisplay({ ...base, actor_kind: 'system' })).toBe('System')
    expect(actorDisplay({ ...base, actor_kind: 'anonymous' })).toBe('Anonymous')
    expect(actorDisplay({ ...base, actor_kind: 'robot' })).toBe('robot')
  })
})
