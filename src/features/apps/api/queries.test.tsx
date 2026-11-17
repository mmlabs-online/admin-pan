import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/api'
import { apiError, fakeApi, json } from '@/test-utils/api'
import { FAKE_CREDENTIAL } from '@/test-utils/fake-credential'
import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import {
  APPS,
  CREDENTIALS,
  PERMISSIONS,
  appsPage,
  credentialsPage,
  permissionsPage,
} from '../components/test-data'
import {
  appCredentialsQueryOptions,
  appPermissionsQueryOptions,
  appQueryOptions,
  appsKeys,
  appsListQueryOptions,
  toAppsListParams,
  useCreateAppMutation,
  useCreatePermissionMutation,
  useIssueCredentialMutation,
  useRevokeCredentialMutation,
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
  return { client, seen, invalidated, wrapper, queryClient }
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

  it('appsKeys.credentials(key,p) is under credentialsAll(key), which is under detail(key)', () => {
    expect(appsKeys.credentialsAll('stoktok')).toEqual([
      ...appsKeys.detail('stoktok'),
      'credentials',
    ])
    expect(appsKeys.credentials('stoktok', { limit: 20, offset: 0 })).toEqual([
      ...appsKeys.credentialsAll('stoktok'),
      { limit: 20, offset: 0 },
    ])
  })

  it('appCredentialsQueryOptions sends GET /apps/{key}/credentials?limit&offset and returns the page', async () => {
    const { client, seen } = fakeApi(() =>
      json(credentialsPage(CREDENTIALS.stoktok))
    )
    const page = await new QueryClient().fetchQuery(
      appCredentialsQueryOptions('stoktok', { limit: 20, offset: 0 }, client)
    )
    expect(seen.map((r) => r.url)).toEqual([
      'https://api.test/api/v1/apps/stoktok/credentials?limit=20&offset=0',
    ])
    expect(page.items).toHaveLength(2)
  })

  it('useIssueCredentialMutation: POST with no body; sink receives FAKE_CREDENTIAL; resolves with metadata without `credential`; mutation state has no FAKE_CREDENTIAL; invalidates credentialsAll(key) only', async () => {
    const meta = CREDENTIALS.stoktok[0]
    const { client, seen, invalidated, wrapper, queryClient } = setup(() =>
      json({ ...meta, credential: FAKE_CREDENTIAL }, 201)
    )
    const issue = await renderHook(
      () => useIssueCredentialMutation('stoktok', client),
      { wrapper }
    )
    const sink: string[] = []
    const result = await issue.result.current.mutateAsync((c) => sink.push(c))
    expect(seen.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/v1/apps/stoktok/credentials',
    ])
    expect(await seen[0].text()).toBe('')
    expect(sink).toEqual([FAKE_CREDENTIAL])
    expect(result).toEqual(meta)
    expect('credential' in result).toBe(false)
    await expect
      .poll(() => queryClient.getMutationCache().getAll().length)
      .toBeLessThanOrEqual(1)
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state)
      )
    ).not.toContain(FAKE_CREDENTIAL)
    expect(invalidated).toEqual([['apps', 'detail', 'stoktok', 'credentials']])
  })

  it('useIssueCredentialMutation: a 500 sends exactly one POST (retry:false) and invalidates credentialsAll(key); a 409 invalidates detail(key); a 201 without a string `credential` rejects with invalid_response and never calls the sink', async () => {
    let respond: () => Response = () => apiError(500, 'internal_error')
    const { client, seen, invalidated, wrapper } = setup(() => respond())
    const issue = await renderHook(
      () => useIssueCredentialMutation('stoktok', client),
      { wrapper }
    )
    const sink: string[] = []
    const run = () =>
      issue.result.current
        .mutateAsync((c) => sink.push(c))
        .catch((e: unknown) => e)

    await run()
    expect(seen).toHaveLength(1)
    expect(invalidated).toEqual([['apps', 'detail', 'stoktok', 'credentials']])

    respond = () => apiError(409, 'conflict')
    await run()
    expect(invalidated[invalidated.length - 1]).toEqual([
      'apps',
      'detail',
      'stoktok',
    ])

    respond = () => json({ ...CREDENTIALS.stoktok[0] }, 201)
    expect(await run()).toMatchObject({ kind: 'invalid_response' })
    expect(sink).toEqual([])
  })

  it('useRevokeCredentialMutation: DELETE …/credentials/{credential_id} (204) invalidates credentialsAll(key); 404 also invalidates', async () => {
    let respond: () => Response = () => new Response(null, { status: 204 })
    const { client, seen, invalidated, wrapper } = setup(() => respond())
    const revoke = await renderHook(
      () => useRevokeCredentialMutation('stoktok', client),
      { wrapper }
    )
    const id = CREDENTIALS.stoktok[0].id
    await revoke.result.current.mutateAsync(id)
    expect(seen.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      `DELETE /api/v1/apps/stoktok/credentials/${id}`,
    ])
    expect(invalidated).toEqual([['apps', 'detail', 'stoktok', 'credentials']])
    respond = () => apiError(404, 'not_found')
    await revoke.result.current.mutateAsync(id).catch(() => {})
    expect(invalidated).toHaveLength(2)
  })

  it('appsKeys.joinRequests is under detail(key) and holds only status, limit and offset', () => {
    const key = appsKeys.joinRequests('stoktok', {
      status: 'pending',
      limit: 20,
      offset: 0,
    })
    expect(key).toEqual([
      'apps',
      'detail',
      'stoktok',
      'join-requests',
      { status: 'pending', limit: 20, offset: 0 },
    ])
    expect(key.slice(0, 3)).toEqual(appsKeys.detail('stoktok'))
    expect(appsKeys.joinRequestsAll('stoktok')).toEqual(key.slice(0, 4))
  })
})
