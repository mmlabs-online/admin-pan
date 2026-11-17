import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/api'
import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { ORGS, orgsPage } from '../components/test-data'
import {
  organizationsKeys,
  organizationsListQueryOptions,
  toOrganizationsListParams,
  useCreateOrganizationMutation,
  useDeleteOrganizationMutation,
  useUpdateOrganizationMutation,
} from './queries'

const ID = ORGS[0].id

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
  return { client, seen, queryClient, invalidated, wrapper }
}

describe('organizations queries', () => {
  it("organizationsKeys.list = ['organizations','list',{limit,offset}]; lists() is its prefix", () => {
    expect(organizationsKeys.list({ limit: 20, offset: 40 })).toEqual([
      'organizations',
      'list',
      { limit: 20, offset: 40 },
    ])
    expect(organizationsKeys.lists()).toEqual(['organizations', 'list'])
  })

  it('toOrganizationsListParams maps pageIndex/pageSize to limit/offset and sends nothing else', () => {
    expect(
      toOrganizationsListParams({ pagination: { pageIndex: 2, pageSize: 10 } })
    ).toEqual({ limit: 10, offset: 20 })
    expect(
      toOrganizationsListParams({ pagination: { pageIndex: 0, pageSize: 500 } })
    ).toEqual({ limit: 100, offset: 0 })
  })

  it('list options GET /api/v1/organizations?limit=10&offset=20', async () => {
    const body = orgsPage(ORGS, 23, 10, 20)
    const { client, seen } = fakeApi(() => json(body))
    const data = await new QueryClient().fetchQuery(
      organizationsListQueryOptions({ limit: 10, offset: 20 }, client)
    )
    expect(data).toEqual(body)
    expect(seen[0].url).toBe(
      'https://api.test/api/v1/organizations?limit=10&offset=20'
    )
  })

  it('surfaces a 403 ApiError', async () => {
    const { client } = fakeApi(() => apiError(403, 'permission_denied'))
    await expect(
      new QueryClient().fetchQuery(
        organizationsListQueryOptions({ limit: 10, offset: 0 }, client)
      )
    ).rejects.toMatchObject({ status: 403, code: 'permission_denied' })
  })

  it('create POSTs the body; update PATCHes /{org_id}; delete DELETEs /{org_id} and resolves on 204', async () => {
    const { client, seen, wrapper } = setup((req) =>
      req.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json(ORGS[0], req.method === 'POST' ? 201 : 200)
    )
    const create = await renderHook(
      () => useCreateOrganizationMutation(client),
      {
        wrapper,
      }
    )
    const update = await renderHook(
      () => useUpdateOrganizationMutation(client),
      {
        wrapper,
      }
    )
    const del = await renderHook(() => useDeleteOrganizationMutation(client), {
      wrapper,
    })

    await create.result.current.mutateAsync({
      slug: 'acme',
      name: 'Acme Corp',
      description: null,
    })
    await update.result.current.mutateAsync({
      id: ID,
      body: { status: 'suspended' },
    })
    await expect(del.result.current.mutateAsync({ id: ID })).resolves.toBe(
      undefined
    )

    expect(seen.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/v1/organizations',
      `PATCH /api/v1/organizations/${ID}`,
      `DELETE /api/v1/organizations/${ID}`,
    ])
    expect(await seen[0].json()).toEqual({
      slug: 'acme',
      name: 'Acme Corp',
      description: null,
    })
    expect(await seen[1].json()).toEqual({ status: 'suspended' })
  })

  it('each mutation invalidates [organizations] on success; on 404/409 it invalidates too; not on 500', async () => {
    let respond: () => Response = () => json(ORGS[0])
    const { client, invalidated, wrapper } = setup(() => respond())
    const update = await renderHook(
      () => useUpdateOrganizationMutation(client),
      {
        wrapper,
      }
    )
    const run = () =>
      update.result.current
        .mutateAsync({ id: ID, body: { name: 'x' } })
        .catch((e: unknown) => e)

    await run()
    expect(invalidated).toHaveLength(1)
    expect(invalidated[0]).toEqual(['organizations'])

    respond = () => apiError(404, 'not_found')
    expect(await run()).toBeInstanceOf(ApiError)
    expect(invalidated).toHaveLength(2)

    respond = () => apiError(409, 'conflict')
    await run()
    expect(invalidated).toHaveLength(3)

    respond = () => apiError(500, 'internal_error')
    await run()
    expect(invalidated).toHaveLength(3)
  })
})
