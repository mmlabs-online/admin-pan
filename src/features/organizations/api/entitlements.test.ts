import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { ENTITLEMENTS, ORGS, entitlementsPage } from '../components/test-data'
import {
  entitlementsKeys,
  orgEntitlementsQueryOptions,
  useGrantEntitlementMutation,
  useUpdateEntitlementMutation,
} from './entitlements'
import { organizationsKeys } from './queries'

const ORG = ORGS[0].id
const ROW = ENTITLEMENTS[ORG][0]

function setup(handler: (req: Request) => Response) {
  const { client, seen } = fakeApi(handler)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidated: unknown[] = []
  const original = queryClient.invalidateQueries.bind(queryClient)
  queryClient.invalidateQueries = ((f: { queryKey: unknown }) => {
    invalidated.push(f.queryKey)
    return original(f as never)
  }) as typeof queryClient.invalidateQueries
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return { client, seen, invalidated, wrapper }
}

describe('entitlements queries', () => {
  it('entitlementsKeys.list(org,p) is under entitlementsKeys.all(org), which is under organizationsKeys.detail(org) and not under organizationsKeys.lists()', () => {
    const list = entitlementsKeys.list(ORG, { limit: 100, offset: 0 })
    const all = entitlementsKeys.all(ORG)
    expect(list.slice(0, all.length)).toEqual(all)
    expect(all.slice(0, 3)).toEqual(organizationsKeys.detail(ORG))
    expect(list.slice(0, 2)).not.toEqual(organizationsKeys.lists())
    expect(list[list.length - 1]).toEqual({ limit: 100, offset: 0 })
  })

  it('orgEntitlementsQueryOptions sends GET /api/v1/organizations/{id}/entitlements?limit=100&offset=0 (no `active`) and returns the page', async () => {
    const body = entitlementsPage(ENTITLEMENTS[ORG])
    const { client, seen } = fakeApi(() => json(body))
    const data = await new QueryClient().fetchQuery(
      orgEntitlementsQueryOptions(ORG, { limit: 100, offset: 0 }, client)
    )
    expect(data).toEqual(body)
    expect(seen[0].url).toBe(
      `https://api.test/api/v1/organizations/${ORG}/entitlements?limit=100&offset=0`
    )
  })
})

describe('useGrantEntitlementMutation', () => {
  it('POST body {app_key, plan, limits} exactly (no `enabled`); 201 invalidates entitlementsKeys.all(org) only; 409 and 404 invalidate organizationsKeys.detail(org); a 502 sends one POST and invalidates entitlementsKeys.all(org)', async () => {
    let respond: () => Response = () => json(ROW, 201)
    const { client, seen, invalidated, wrapper } = setup(() => respond())
    const grant = await renderHook(
      () => useGrantEntitlementMutation(ORG, client),
      { wrapper }
    )
    const body = { app_key: 'calechip', plan: 'pro', limits: { seats: 10 } }
    const run = () => grant.result.current.mutateAsync(body).catch(() => null)

    await run()
    expect(seen[0].method).toBe('POST')
    expect(new URL(seen[0].url).pathname).toBe(
      `/api/v1/organizations/${ORG}/entitlements`
    )
    expect(await seen[0].json()).toEqual(body)
    expect(invalidated).toEqual([entitlementsKeys.all(ORG)])

    respond = () => apiError(409, 'conflict')
    await run()
    respond = () => apiError(404, 'not_found')
    await run()
    expect(invalidated.slice(1)).toEqual([
      organizationsKeys.detail(ORG),
      organizationsKeys.detail(ORG),
    ])

    respond = () => apiError(502, 'bad_gateway')
    const before = seen.length
    await run()
    expect(seen.length - before).toBe(1)
    expect(invalidated[3]).toEqual(entitlementsKeys.all(ORG))
  })
})

describe('useUpdateEntitlementMutation', () => {
  it('PATCH …/entitlements/{entitlement_id} (row id, not app key) with the given body; success invalidates entitlementsKeys.all(org); 404 invalidates organizationsKeys.detail(org)', async () => {
    let respond: () => Response = () => json(ROW)
    const { client, seen, invalidated, wrapper } = setup(() => respond())
    const update = await renderHook(
      () => useUpdateEntitlementMutation(ORG, client),
      { wrapper }
    )
    const run = () =>
      update.result.current
        .mutateAsync({ entitlementId: ROW.id, body: { enabled: false } })
        .catch(() => null)

    await run()
    expect(seen[0].method).toBe('PATCH')
    expect(new URL(seen[0].url).pathname).toBe(
      `/api/v1/organizations/${ORG}/entitlements/${ROW.id}`
    )
    expect(await seen[0].json()).toEqual({ enabled: false })
    expect(invalidated).toEqual([entitlementsKeys.all(ORG)])

    respond = () => apiError(404, 'not_found')
    await run()
    expect(invalidated[1]).toEqual(organizationsKeys.detail(ORG))
  })
})
