import { describe, expect, it } from 'vitest'
import { type AuditLogEntry } from '../data/schema'
import {
  actorLabel,
  diffChanges,
  filterByDateRange,
  formatDay,
  maskEmail,
  matchesActor,
  parseDay,
  toCsv,
} from './format'

const entry: AuditLogEntry = {
  id: 'e1',
  occurred_at: '2026-11-10T10:00:00.000Z',
  actor_user_id: 'u1',
  actor_email: 'admin@mmlabs.online',
  action: 'organization.update',
  target_type: 'organization',
  target_id: 'org-1',
  app_key: null,
  org_id: 'org-1',
  changes: { before: { name: 'Old' }, after: { name: 'New' } },
  ip: '10.0.0.1',
  user_agent: 'Mozilla/5.0',
  request_id: 'req_abc',
}

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@example.com')
  })
  it('masks malformed input entirely', () => {
    expect(maskEmail('nope')).toBe('***')
    expect(maskEmail('@example.com')).toBe('***')
  })
})

describe('actorLabel / matchesActor', () => {
  it('labels a null actor as System', () => {
    const sys = { ...entry, actor_email: null, actor_user_id: null }
    expect(actorLabel(sys)).toBe('System')
    expect(matchesActor(sys, 'sys')).toBe(true)
  })
  it('matches email case-insensitively and by user id', () => {
    expect(matchesActor(entry, 'ADMIN@')).toBe(true)
    expect(matchesActor(entry, 'u1')).toBe(true)
    expect(matchesActor(entry, 'bob')).toBe(false)
    expect(matchesActor(entry, '  ')).toBe(true)
  })
})

describe('diffChanges', () => {
  it('returns no lines when there are no changes', () => {
    expect(diffChanges(null)).toEqual([])
  })
  it('marks changed, unchanged, added and removed keys', () => {
    expect(
      diffChanges({
        before: { name: 'Old', slug: 'acme', plan: 'free' },
        after: { name: 'New', slug: 'acme', tags: ['a'] },
      })
    ).toEqual([
      { kind: 'removed', text: '- name: "Old"' },
      { kind: 'added', text: '+ name: "New"' },
      { kind: 'unchanged', text: '  slug: "acme"' },
      { kind: 'removed', text: '- plan: "free"' },
      { kind: 'added', text: '+ tags: ["a"]' },
    ])
  })
  it('handles create-only and delete-only changes', () => {
    expect(diffChanges({ after: { status: 'active' } })).toEqual([
      { kind: 'added', text: '+ status: "active"' },
    ])
    expect(diffChanges({ before: { status: 'active' } })).toEqual([
      { kind: 'removed', text: '- status: "active"' },
    ])
  })
})

describe('date range helpers', () => {
  it('round-trips yyyy-MM-dd and rejects junk', () => {
    expect(formatDay(parseDay('2026-03-05')!)).toBe('2026-03-05')
    expect(parseDay('05/03/2026')).toBeUndefined()
    expect(parseDay(undefined)).toBeUndefined()
  })
  it('filters inclusively by local calendar day', () => {
    const at = (d: Date) => ({ occurred_at: d.toISOString() })
    const rows = [
      at(new Date(2026, 10, 1, 0, 0, 0)),
      at(new Date(2026, 10, 5, 23, 59, 59)),
      at(new Date(2026, 10, 6, 0, 0, 0)),
    ]
    expect(filterByDateRange(rows, '2026-11-01', '2026-11-05')).toEqual(
      rows.slice(0, 2)
    )
    expect(filterByDateRange(rows, '2026-11-06')).toEqual(rows.slice(2))
    expect(filterByDateRange(rows)).toBe(rows)
  })
})

describe('toCsv', () => {
  it('writes a header and escapes quotes, commas and JSON', () => {
    const csv = toCsv([{ ...entry, user_agent: 'Agent, "quoted"' }])
    const [header, row] = csv.split('\r\n')
    expect(header.split(',')[0]).toBe('id')
    expect(row).toContain('"Agent, ""quoted"""')
    expect(row).toContain('"{""before"":{""name"":""Old""}')
    expect(row).toContain(',,org-1,') // null app_key → empty cell
  })
  it('neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ ...entry, user_agent: '=HYPERLINK("x")' }])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
