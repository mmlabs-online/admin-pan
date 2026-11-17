import { QueryClient } from '@tanstack/react-query'
import { fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { toAuditRange } from '../lib/format'
import {
  auditLogsKeys,
  auditLogsQueryOptions,
  toAuditListParams,
} from './queries'

const ID = '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01'

describe('toAuditListParams', () => {
  it('maps each URL filter to its API param', () => {
    expect(
      toAuditListParams({
        page: 3,
        pageSize: 20,
        action: 'user.disabled',
        targetType: 'user',
        actorKind: 'user',
        outcome: 'success',
        app: 'admin',
        actor: ID,
        target: ID,
        from: '2026-11-03',
        to: '2026-11-05',
      })
    ).toEqual({
      limit: 20,
      offset: 40,
      action: 'user.disabled',
      target_type: 'user',
      actor_kind: 'user',
      outcome: 'success',
      app_key: 'admin',
      actor_user_id: ID,
      target_id: ID,
      ...toAuditRange('2026-11-03', '2026-11-05'),
    })
  })

  it('omits empty and invalid values', () => {
    expect(toAuditListParams({})).toEqual({ limit: 20, offset: 0 })
    expect(
      toAuditListParams({
        app: 'Not A Key',
        actor: 'alice@example.com',
        target: 'nope',
        from: 'x',
      })
    ).toEqual({ limit: 20, offset: 0 })
  })
})

describe('auditLogsKeys', () => {
  it('omits undefined params', () => {
    expect(
      auditLogsKeys.list({ limit: 20, offset: 0, action: undefined })
    ).toEqual(auditLogsKeys.list({ limit: 20, offset: 0 }))
  })
})

describe('auditLogsQueryOptions', () => {
  it('GETs /api/v1/audit-logs with the query string', async () => {
    const { client, seen } = fakeApi(() =>
      json({ items: [], total: 0, limit: 20, offset: 0 })
    )
    await new QueryClient().fetchQuery(
      auditLogsQueryOptions(
        { limit: 20, offset: 20, target_type: 'user', target_id: ID },
        client
      )
    )
    const url = new URL(seen[0].url)
    expect(url.pathname).toBe('/api/v1/audit-logs')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('offset')).toBe('20')
    expect(url.searchParams.get('target_type')).toBe('user')
    expect(url.searchParams.get('target_id')).toBe(ID)
  })
})
