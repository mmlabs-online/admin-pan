import { QueryClient } from '@tanstack/react-query'
import { createApiClient } from '@/api'
import { describe, expect, it, vi } from 'vitest'
import { organizationsKeys, organizationsListQueryOptions } from './queries'

const api = (respond: () => Response) => {
  const seen: Request[] = []
  const fetch = vi.fn(async (req: Request) => {
    seen.push(req)
    return respond()
  })
  return {
    seen,
    client: createApiClient({
      baseUrl: 'https://api.test',
      fetch: fetch as unknown as typeof globalThis.fetch,
    }),
  }
}

describe('organizations queries', () => {
  it('organizationsKeys.list includes the page params', () => {
    expect(organizationsKeys.list({ limit: 20, offset: 40 })).toEqual([
      'organizations',
      'list',
      { limit: 20, offset: 40 },
    ])
  })

  it('organizationsListQueryOptions fetches GET /api/v1/organizations with limit/offset', async () => {
    const body = { items: [], total: 0, limit: 20, offset: 40 }
    const { client, seen } = api(
      () =>
        new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        })
    )
    const data = await new QueryClient().fetchQuery(
      organizationsListQueryOptions({ limit: 20, offset: 40 }, client)
    )
    expect(data).toEqual(body)
    expect(seen[0].url).toBe(
      'https://api.test/api/v1/organizations?limit=20&offset=40'
    )
  })

  it('surfaces a 403 ApiError to the caller', async () => {
    const { client } = api(
      () =>
        new Response(
          JSON.stringify({
            error: { code: 'permission_denied', message: 'no', details: null },
          }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        )
    )
    await expect(
      new QueryClient().fetchQuery(organizationsListQueryOptions({}, client))
    ).rejects.toMatchObject({ name: 'ApiError', status: 403 })
  })
})
