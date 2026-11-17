import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/api'
import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import {
  APPS,
  PERMISSIONS,
  appsPage,
  permissionsPage,
} from '../components/test-data'
import {
  appPermissionsQueryOptions,
  appQueryOptions,
  appsKeys,
  appsListQueryOptions,
  toAppsListParams,
  useCreateAppMutation,
  useCreatePermissionMutation,
  useUpdateAppMutation,
  useUpdatePermissionMutation,
} from './queries'

const PERM = PERMISSIONS.stoktok[0]

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

describe('apps queries', () => {
  it("appsKeys: list = ['apps','list',{limit,offset}]; detail(key) = ['apps','detail',key]; permissions(key,p) is under detail(key)", () => {
    expect(appsKeys.list({ limit: 10, offset: 20 })).toEqual([
      'apps',
      'list',
      { limit: 10, offset: 20 },
    ])
    expect(appsKeys.detail('stoktok')).toEqual(['apps', 'detail', 'stoktok'])
    expect(appsKeys.permissions('stoktok', { limit: 50, offset: 0 })).toEqual([
      'apps',
      'detail',
      'stoktok',
      'permissions',
      { limit: 50, offset: 0 },
    ])
  })

  it('toAppsListParams maps pageIndex/pageSize to limit/offset and sends nothing else', () => {
    expect(
      toAppsListParams({ pagination: { pageIndex: 2, pageSize: 10 } })
    ).toEqual({ limit: 10, offset: 20 })
    expect(
      toAppsListParams({ pagination: { pageIndex: 0, pageSize: 500 } })
    ).toEqual({ limit: 100, offset: 0 })
  })

  it('list GET /api/v1/apps?limit=10&offset=20; detail GET /api/v1/apps/stoktok; permissions GET /api/v1/apps/stoktok/permissions?limit=50&offset=0', async () => {
    const { client, seen } = fakeApi((req) => {
      const p = new URL(req.url).pathname
      if (p.endsWith('/permissions'))
        return json(permissionsPage(PERMISSIONS.stoktok))
      return p === '/api/v1/apps' ? json(appsPage()) : json(APPS[2])
    })
    const qc = new QueryClient()
    await qc.fetchQuery(appsListQueryOptions({ limit: 10, offset: 20 }, client))
    await qc.fetchQuery(appQueryOptions('stoktok', client))
    await qc.fetchQuery(
      appPermissionsQueryOptions('stoktok', { limit: 50, offset: 0 }, client)
    )
    expect(seen.map((r) => r.url)).toEqual([
      'https://api.test/api/v1/apps?limit=10&offset=20',
      'https://api.test/api/v1/apps/stoktok',
      'https://api.test/api/v1/apps/stoktok/permissions?limit=50&offset=0',
    ])
  })

  it('create POSTs AppCreate; update PATCHes /apps/{key} with the given body only', async () => {
    const { client, seen, wrapper } = setup((req) =>
      json(APPS[2], req.method === 'POST' ? 201 : 200)
    )
    const create = await renderHook(() => useCreateAppMutation(client), {
      wrapper,
    })
    const update = await renderHook(() => useUpdateAppMutation(client), {
      wrapper,
    })
    const body: Parameters<typeof create.result.current.mutateAsync>[0] = {
      key: 'newapp',
      name: 'New',
      join_policy: 'open',
      org_mode: 'none',
      origins: [],
    }
    await create.result.current.mutateAsync(body)
    await update.result.current.mutateAsync({
      key: 'stoktok',
      body: { status: 'disabled' },
    })
    expect(seen.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/v1/apps',
      'PATCH /api/v1/apps/stoktok',
    ])
    expect(await seen[0].json()).toEqual(body)
    expect(await seen[1].json()).toEqual({ status: 'disabled' })
  })

  it("app mutations invalidate ['apps'] on success and on 404/409; not on 500", async () => {
    let respond: () => Response = () => json(APPS[2])
    const { client, invalidated, wrapper } = setup(() => respond())
    const update = await renderHook(() => useUpdateAppMutation(client), {
      wrapper,
    })
    const run = () =>
      update.result.current
        .mutateAsync({ key: 'stoktok', body: { name: 'x' } })
        .catch((e: unknown) => e)

    await run()
    expect(invalidated).toEqual([['apps']])
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

  it("permission create POSTs /apps/{key}/permissions; update PATCHes /permissions/{id}; both invalidate ['apps','detail',key] on success and on 404/409", async () => {
    let respond: (req: Request) => Response = (req) =>
      json(PERM, req.method === 'POST' ? 201 : 200)
    const { client, seen, invalidated, wrapper } = setup((r) => respond(r))
    const create = await renderHook(
      () => useCreatePermissionMutation('stoktok', client),
      { wrapper }
    )
    const update = await renderHook(
      () => useUpdatePermissionMutation('stoktok', client),
      { wrapper }
    )
    await create.result.current.mutateAsync({
      key: 'stoktok:orders:read',
      is_admin: false,
    })
    await update.result.current.mutateAsync({
      permissionId: PERM.id,
      body: { is_admin: true },
    })
    expect(seen.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/v1/apps/stoktok/permissions',
      `PATCH /api/v1/apps/stoktok/permissions/${PERM.id}`,
    ])
    expect(await seen[1].json()).toEqual({ is_admin: true })
    expect(invalidated).toEqual([
      ['apps', 'detail', 'stoktok'],
      ['apps', 'detail', 'stoktok'],
    ])

    respond = () => apiError(409, 'conflict')
    await update.result.current
      .mutateAsync({ permissionId: PERM.id, body: { is_admin: true } })
      .catch(() => {})
    respond = () => apiError(404, 'not_found')
    await update.result.current
      .mutateAsync({ permissionId: PERM.id, body: { is_admin: true } })
      .catch(() => {})
    expect(invalidated).toHaveLength(4)
  })

  it("permission writes on app 'admin' also invalidate ['me','permissions']; on 'stoktok' they do not", async () => {
    const { client, invalidated, wrapper } = setup(() => json(PERM))
    const onAdmin = await renderHook(
      () => useUpdatePermissionMutation('admin', client),
      { wrapper }
    )
    await onAdmin.result.current.mutateAsync({
      permissionId: PERM.id,
      body: { is_admin: true },
    })
    expect(invalidated).toContainEqual(['me', 'permissions'])

    invalidated.length = 0
    const onOther = await renderHook(
      () => useUpdatePermissionMutation('stoktok', client),
      { wrapper }
    )
    await onOther.result.current.mutateAsync({
      permissionId: PERM.id,
      body: { is_admin: true },
    })
    expect(invalidated).not.toContainEqual(['me', 'permissions'])
  })
})
