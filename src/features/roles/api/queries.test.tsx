import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import {
  PERMISSIONS,
  ROLES,
  VIEWER_ID,
  pageOf,
  role,
} from '../components/test-data'
import {
  appAllPermissionsQueryOptions,
  roleDefinitionQueryOptions,
  roleDefinitionsQueryOptions,
  rolesKeys,
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useRenameRoleMutation,
  useReplaceRolePermissionsMutation,
} from './queries'

const call = (r: Request) => `${r.method} ${new URL(r.url).pathname}`

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
  return { client, seen, invalidated, wrapper, queryClient }
}

const hasKey = (list: unknown[], key: readonly unknown[]) =>
  list.some((k) => JSON.stringify(k) === JSON.stringify(key))

describe('role queries', () => {
  it("rolesKeys: all(app) = ['apps','detail',app,'roles']; list and detail are under it", () => {
    expect(rolesKeys.all('stoktok')).toEqual([
      'apps',
      'detail',
      'stoktok',
      'roles',
    ])
    expect(
      rolesKeys.list('stoktok', { limit: 10, offset: 0 }).slice(0, 4)
    ).toEqual(rolesKeys.all('stoktok'))
    expect(rolesKeys.detail('stoktok', 'x').slice(0, 4)).toEqual(
      rolesKeys.all('stoktok')
    )
  })

  it('list GET /api/v1/apps/stoktok/role-definitions?limit=10&offset=20; detail GET …/role-definitions/{id}', async () => {
    const { client, seen } = fakeApi(() => json(ROLES.stoktok[0]))
    const qc = new QueryClient()
    await qc.fetchQuery(
      roleDefinitionsQueryOptions('stoktok', { limit: 10, offset: 20 }, client)
    )
    await qc.fetchQuery(
      roleDefinitionQueryOptions('stoktok', VIEWER_ID, client)
    )
    expect(seen.map((r) => r.url)).toEqual([
      'https://api.test/api/v1/apps/stoktok/role-definitions?limit=10&offset=20',
      `https://api.test/api/v1/apps/stoktok/role-definitions/${VIEWER_ID}`,
    ])
  })

  it("list placeholder keeps the previous page of the same app but never another app's rows", () => {
    const { client } = fakeApi(() => json({}))
    const options = (app: string) =>
      roleDefinitionsQueryOptions(app, { limit: 10, offset: 0 }, client)
    const placeholder = options('stoktok').placeholderData as (
      prev: unknown,
      prevQuery: { queryKey: readonly unknown[] } | undefined
    ) => unknown
    const prev = pageOf(ROLES.stoktok)
    expect(
      placeholder(prev, {
        queryKey: rolesKeys.list('stoktok', { limit: 10, offset: 10 }),
      })
    ).toBe(prev)
    expect(
      placeholder(prev, {
        queryKey: rolesKeys.list('calechip', { limit: 10, offset: 0 }),
      })
    ).toBeUndefined()
  })

  it('all-permissions query pages with limit=100 until total (130 -> 2 requests, offset 0 and 100) and returns all items', async () => {
    const all = Array.from({ length: 130 }, (_, i) => ({
      ...PERMISSIONS.stoktok[0],
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      key: `stoktok:r${i}:read`,
    }))
    const { client, seen } = fakeApi((req) => {
      const q = new URL(req.url).searchParams
      return json(pageOf(all, Number(q.get('limit')), Number(q.get('offset'))))
    })
    const items = await new QueryClient().fetchQuery(
      appAllPermissionsQueryOptions('stoktok', client)
    )
    expect(items).toHaveLength(130)
    expect(seen.map((r) => new URL(r.url).search)).toEqual([
      '?limit=100&offset=0',
      '?limit=100&offset=100',
    ])
  })

  it('create POSTs {key,name}; rename PATCHes {name}; replace PUTs {permission_keys}; delete DELETEs; all to the given id', async () => {
    const { client, seen, wrapper } = setup((req) =>
      req.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json(
            role('stoktok', VIEWER_ID, 'viewer'),
            req.method === 'POST' ? 201 : 200
          )
    )
    const create = await renderHook(
      () => useCreateRoleMutation('stoktok', client),
      { wrapper }
    )
    const rename = await renderHook(
      () => useRenameRoleMutation('stoktok', client),
      { wrapper }
    )
    const replace = await renderHook(
      () => useReplaceRolePermissionsMutation('stoktok', client),
      { wrapper }
    )
    const del = await renderHook(
      () => useDeleteRoleMutation('stoktok', client),
      { wrapper }
    )
    await create.result.current.mutateAsync({
      key: 'stoktok:viewer',
      name: 'Viewer',
    })
    await rename.result.current.mutateAsync({ roleId: VIEWER_ID, name: 'V2' })
    await replace.result.current.mutateAsync({
      roleId: VIEWER_ID,
      keys: ['stoktok:a:b'],
    })
    await del.result.current.mutateAsync(VIEWER_ID)
    expect(seen.map(call)).toEqual([
      'POST /api/v1/apps/stoktok/roles',
      `PATCH /api/v1/apps/stoktok/roles/${VIEWER_ID}`,
      `PUT /api/v1/apps/stoktok/roles/${VIEWER_ID}/permissions`,
      `DELETE /api/v1/apps/stoktok/roles/${VIEWER_ID}`,
    ])
    expect(await seen[0].json()).toEqual({
      key: 'stoktok:viewer',
      name: 'Viewer',
    })
    expect(await seen[1].json()).toEqual({ name: 'V2' })
    expect(await seen[2].json()).toEqual({ permission_keys: ['stoktok:a:b'] })
  })

  it('role mutations invalidate the app roles on success and on 404/409; replace also invalidates the app on 404/409/422', async () => {
    const roles = rolesKeys.all('stoktok')
    const appKey = ['apps', 'detail', 'stoktok']
    for (const [status, code, alsoApp] of [
      [404, 'not_found', true],
      [409, 'conflict', true],
      [422, 'unprocessable', true],
    ] as const) {
      const { client, invalidated, wrapper } = setup(() =>
        apiError(status, code)
      )
      const replace = await renderHook(
        () => useReplaceRolePermissionsMutation('stoktok', client),
        { wrapper }
      )
      const rename = await renderHook(
        () => useRenameRoleMutation('stoktok', client),
        { wrapper }
      )
      await expect(
        replace.result.current.mutateAsync({ roleId: VIEWER_ID, keys: [] })
      ).rejects.toBeDefined()
      await expect(
        rename.result.current.mutateAsync({ roleId: VIEWER_ID, name: 'x' })
      ).rejects.toBeDefined()
      expect(hasKey(invalidated, appKey), `${status} app`).toBe(alsoApp)
      expect(
        hasKey(invalidated, roles) === (status !== 422),
        `${status} roles`
      ).toBe(true)
    }
    const ok = setup(() => json(ROLES.stoktok[0]))
    const rename = await renderHook(
      () => useRenameRoleMutation('stoktok', ok.client),
      {
        wrapper: ok.wrapper,
      }
    )
    await rename.result.current.mutateAsync({ roleId: VIEWER_ID, name: 'x' })
    expect(hasKey(ok.invalidated, roles)).toBe(true)
  })

  it("create/rename/replace/delete on app 'admin' invalidate ['me','permissions']; on 'stoktok' they do not", async () => {
    for (const [app, expected] of [
      ['admin', true],
      ['stoktok', false],
    ] as const) {
      const { client, invalidated, wrapper } = setup((req) =>
        req.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : json(ROLES.stoktok[0])
      )
      const create = await renderHook(
        () => useCreateRoleMutation(app, client),
        { wrapper }
      )
      const rename = await renderHook(
        () => useRenameRoleMutation(app, client),
        { wrapper }
      )
      const replace = await renderHook(
        () => useReplaceRolePermissionsMutation(app, client),
        { wrapper }
      )
      const del = await renderHook(() => useDeleteRoleMutation(app, client), {
        wrapper,
      })
      await create.result.current.mutateAsync({ key: `${app}:x`, name: 'X' })
      await rename.result.current.mutateAsync({ roleId: VIEWER_ID, name: 'x' })
      await replace.result.current.mutateAsync({ roleId: VIEWER_ID, keys: [] })
      await del.result.current.mutateAsync(VIEWER_ID)
      const me = invalidated.filter((k) => hasKey([k], ['me', 'permissions']))
      expect(me.length, app).toBe(expected ? 4 : 0)
    }
  })

  it('create has retry: false and a failing POST is sent once', async () => {
    const { client, seen } = fakeApi(() => apiError(500, 'internal'))
    // Default retry of the app client would retry; the mutation must not.
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: 3, retryDelay: 1 } },
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)
    const create = await renderHook(
      () => useCreateRoleMutation('stoktok', client),
      { wrapper }
    )
    await expect(
      create.result.current.mutateAsync({ key: 'stoktok:x', name: 'X' })
    ).rejects.toBeDefined()
    expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1)
  })
})
