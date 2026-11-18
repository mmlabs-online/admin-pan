import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { STATS } from '../components/test-data'
import {
  DASHBOARD_STALE_TIME,
  dashboardKeys,
  dashboardStatsQueryOptions,
} from './queries'

const run = (o: ReturnType<typeof dashboardStatsQueryOptions>) =>
  (o.queryFn as (c: { signal: AbortSignal }) => Promise<unknown>)({
    signal: new AbortController().signal,
  })

describe('dashboardStatsQueryOptions', () => {
  it('key [stats, dashboard], staleTime 60_000; queryFn sends one GET with no query string and returns the body', async () => {
    const { client, seen } = fakeApi(() => json(STATS))
    const o = dashboardStatsQueryOptions(client)
    expect(o.queryKey).toEqual(['stats', 'dashboard'])
    expect(dashboardKeys.dashboard()).toEqual(['stats', 'dashboard'])
    expect(o.staleTime).toBe(60_000)
    expect(DASHBOARD_STALE_TIME).toBe(60_000)
    expect(await run(o)).toEqual(STATS)
    expect(seen).toHaveLength(1)
    expect(seen[0].method).toBe('GET')
    expect(seen[0].url).toBe('https://api.test/api/v1/stats/dashboard')
  })

  it('a 403 envelope rejects with ApiError status 403 code permission_denied', async () => {
    const { client } = fakeApi(() => apiError(403, 'permission_denied'))
    await expect(run(dashboardStatsQueryOptions(client))).rejects.toMatchObject(
      { status: 403, code: 'permission_denied' }
    )
  })
})
