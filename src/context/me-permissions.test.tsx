import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createApiClient, type ApiClient } from '@/api'
import { apiError, fakeApi, json as ok } from '@/test-utils/api'
import {
  ACCOUNT_A,
  ACCOUNT_B,
  BASE,
  createTestAuthClient,
  fakeIdentityApi,
  json,
  memoryStorage,
  renderWithAuth,
  row,
  type Handler,
} from '@/test-utils/auth'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { type AdminPermission } from '@/lib/permissions/registry'
import {
  AuthPermissionProvider,
  MePermissionProvider,
  usePermission,
  useSelfUserId,
} from './permission-provider'

const UID = '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01'
const body = (permissions: string[], extra = {}) => ({
  user_id: UID,
  roles: [],
  permissions,
  ...extra,
})

const READ = {
  kind: 'permission',
  permission: 'admin:users:read' as AdminPermission,
  operations: [],
} as const
const WRITE = { ...READ, permission: 'admin:users:write' as AdminPermission }

function Probe() {
  const read = usePermission(READ)
  const write = usePermission(WRITE)
  const self = useSelfUserId()
  return (
    <p>
      read={read} write={write} self={self ?? 'none'}
    </p>
  )
}

const mount = (api: ApiClient, accountId = 'acc') =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MePermissionProvider accountId={accountId} api={api}>
        <Probe />
      </MePermissionProvider>
    </QueryClientProvider>
  )

describe('MePermissionProvider', () => {
  it('requests GET /api/v1/me/permissions with no query string', async () => {
    const { client, seen } = fakeApi(() => ok(body([])))
    const screen = await mount(client)
    await expect.element(screen.getByText(/read=denied/)).toBeVisible()
    expect(seen).toHaveLength(1)
    const url = new URL(seen[0].url)
    expect(seen[0].method).toBe('GET')
    expect(url.pathname).toBe('/api/v1/me/permissions')
    expect(url.search).toBe('')
  })

  it('granted, denied and unknown', async () => {
    const { client } = fakeApi(() => ok(body(['admin:users:read'])))
    const screen = await mount(client)
    await expect
      .element(screen.getByText(`read=granted write=denied self=${UID}`))
      .toBeVisible()
  })

  it('admin:* response grants every action', async () => {
    const { client } = fakeApi(() => ok(body(['admin:*'])))
    const screen = await mount(client)
    await expect
      .element(screen.getByText(/read=granted write=granted/))
      .toBeVisible()
  })

  it('loading (never-resolving fetch) gives unknown', async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    const screen = await mount(client)
    await expect
      .element(screen.getByText('read=unknown write=unknown self=none'))
      .toBeVisible()
  })

  it('500, network error, 403, 404 and malformed body all give unknown, never denied', async () => {
    const cases: Array<() => Response | Promise<Response>> = [
      () => apiError(500, 'internal_error'),
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => apiError(403, 'permission_denied'),
      () => apiError(404, 'not_found'),
      () => ok({ user_id: UID, roles: [] }),
      () => ok(body([1] as unknown as string[])),
      () => ok({ roles: [], permissions: [] }),
    ]
    for (const h of cases) {
      const { client } = fakeApi(h)
      const screen = await mount(client)
      await expect
        .element(screen.getByText('read=unknown write=unknown self=none'))
        .toBeVisible()
      await new Promise((r) => setTimeout(r, 30))
      await expect
        .element(screen.getByText('read=unknown write=unknown self=none'))
        .toBeVisible()
      await screen.unmount()
    }
  })

  it('an extra unknown field in the response is accepted', async () => {
    const { client } = fakeApi(() =>
      ok(body(['admin:users:read'], { future_field: 1 }))
    )
    const screen = await mount(client)
    await expect.element(screen.getByText(/read=granted/)).toBeVisible()
  })

  it('success then a failed refetch gives unknown, not stale denied', async () => {
    let fail = false
    const { client } = fakeApi(() =>
      fail ? apiError(500, 'internal_error') : ok(body([]))
    )
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const screen = await render(
      <QueryClientProvider client={qc}>
        <MePermissionProvider accountId='acc' api={client}>
          <Probe />
        </MePermissionProvider>
      </QueryClientProvider>
    )
    await expect.element(screen.getByText(/read=denied/)).toBeVisible()
    fail = true
    await qc.invalidateQueries({ queryKey: ['me', 'permissions'] })
    await expect
      .element(screen.getByText('read=unknown write=unknown self=none'))
      .toBeVisible()
  })

  it('nothing is persisted and nothing is logged', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (m) => vi.spyOn(console, m)
    )
    const { client } = fakeApi(() => ok(body(['admin:users:read'])))
    const screen = await mount(client)
    await expect.element(screen.getByText(/read=granted/)).toBeVisible()
    for (const store of [localStorage, sessionStorage])
      for (let i = 0; i < store.length; i++) {
        const v = store.getItem(store.key(i)!) ?? ''
        expect(v).not.toContain(UID)
        expect(v).not.toContain('admin:users')
      }
    for (const s of spies)
      expect(JSON.stringify(s.mock.calls)).not.toContain(UID)
    spies.forEach((s) => s.mockRestore())
  })
})

describe('AuthPermissionProvider', () => {
  const KEY = 'GET /api/v1/me/permissions'
  const A = row(ACCOUNT_A, 'a@staff.test')
  const B = row(ACCOUNT_B, 'b@staff.test')

  function setup(handler: Handler) {
    const identity = fakeIdentityApi({
      accounts: [A, B],
      routes: { [KEY]: handler },
    })
    const client = createTestAuthClient(identity, {
      storage: memoryStorage({ mm_account_id: ACCOUNT_A }).storage,
    })
    const api = createApiClient({
      baseUrl: BASE,
      bearerFetch: (req) => client.fetchWithToken(req),
    })
    const rendered = renderWithAuth({
      client,
      extra: (
        <AuthPermissionProvider api={api}>
          <Probe />
        </AuthPermissionProvider>
      ),
    })
    return { identity, client, rendered }
  }

  it('a mounted provider refetches after an auth change', async () => {
    const { identity, client, rendered } = setup(() => json(200, body([])))
    const { screen } = await rendered
    await expect.element(screen.getByText(/read=denied/)).toBeVisible()
    expect(identity.count(KEY)).toBe(1)
    client.selectAccount(ACCOUNT_B)
    await vi.waitFor(() => expect(identity.count(KEY)).toBe(2))
  })

  it("account switch A→B: B is requested and A's permissions and user_id are never used for B", async () => {
    let n = 0
    const { identity, client, rendered } = setup(() =>
      n++ === 0
        ? json(200, body(['admin:users:read']))
        : new Promise<Response>(() => {})
    )
    const { screen } = await rendered
    await expect
      .element(screen.getByText(`read=granted write=denied self=${UID}`))
      .toBeVisible()
    client.selectAccount(ACCOUNT_B)
    await vi.waitFor(() => expect(identity.count(KEY)).toBe(2))
    await expect
      .element(screen.getByText('read=unknown write=unknown self=none'))
      .toBeVisible()
  })
})
