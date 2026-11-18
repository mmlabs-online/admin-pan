import { describe, expect, it } from 'vitest'
import { STATS, withStats } from '../components/test-data'
import { toAttentionItems, toKpis, toSignupRows } from './view'

describe('toKpis', () => {
  it('maps each field once, with exact value and detail', () => {
    expect(toKpis(STATS)).toEqual([
      {
        key: 'users',
        label: 'Users',
        value: 1284,
        detail: '1,200 active · 84 disabled',
      },
      {
        key: 'organizations',
        label: 'Active organizations',
        value: 57,
        detail: '4 suspended · 61 total',
      },
      {
        key: 'apps',
        label: 'Registered apps',
        value: 9,
        detail: '8 active · 1 disabled',
      },
      {
        key: 'sign_ins_24h',
        label: 'Sign-ins (24 h)',
        value: 342,
        detail: '19 failed',
      },
    ])
  })
})

describe('toSignupRows', () => {
  it('12 rows in API order; only the last is partial', () => {
    const rows = toSignupRows(STATS)
    expect(rows).toHaveLength(12)
    expect(rows.map((r) => r.month)).toEqual(
      STATS.sign_ups.by_month.map((m) => m.month)
    )
    expect(rows.filter((r) => r.partial)).toHaveLength(1)
    expect(rows[11]).toEqual({
      month: '2026-11',
      label: 'Nov 2026 (partial)',
      tick: 'Nov 26',
      count: 177,
      partial: true,
    })
    expect(rows[0]).toMatchObject({ label: 'Dec 2025', partial: false })
  })

  it('one row is partial; no rows gives no rows', () => {
    const one = withStats({
      sign_ups: {
        time_zone: 'Etc/UTC',
        by_month: [{ month: '2026-11', count: 2 }],
      },
    })
    expect(toSignupRows(one)).toMatchObject([{ count: 2, partial: true }])
    const none = withStats({ sign_ups: { time_zone: 'Etc/UTC', by_month: [] } })
    expect(toSignupRows(none)).toEqual([])
  })
})

describe('toAttentionItems', () => {
  it('maps counts and links only the failed sign-ins row', () => {
    expect(toAttentionItems(STATS)).toEqual([
      {
        id: 'unverified',
        label: 'Users with unverified email (includes disabled users)',
        count: 37,
      },
      { id: 'suspended', label: 'Suspended organizations', count: 4 },
      {
        id: 'failed-sign-ins',
        label: 'Failed sign-ins (last 24 h)',
        count: 19,
        to: '/audit-log',
        search: { action: 'auth.login_failed' },
      },
    ])
  })
})
