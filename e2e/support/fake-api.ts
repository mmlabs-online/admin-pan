import type { BrowserContext, Route } from '@playwright/test'
import type { components } from '../../src/api/schema'
import {
  FAKE_CREDENTIAL,
  FAKE_KEY_ID,
} from '../../src/test-utils/fake-credential'

type UserRead = components['schemas']['UserRead']
type OrganizationRead = components['schemas']['OrganizationRead']
type AuditLogRead = components['schemas']['AuditLogRead']
type AppRead = components['schemas']['AppRead']
type EntitlementRead = components['schemas']['EntitlementRead']
type PermissionRead = components['schemas']['PermissionRead']
type RoleDefinitionRead = components['schemas']['RoleDefinitionRead']
type AppCredentialRead = components['schemas']['AppCredentialRead']
type JoinRequestRead = components['schemas']['JoinRequestRead']
type UserSessionRead = components['schemas']['UserSessionRead']
type AssignmentRead = components['schemas']['AssignmentRead']
type RoleHolderRead = components['schemas']['RoleHolderRead']
type MePermissions = components['schemas']['MePermissions']
type DashboardStats = components['schemas']['DashboardStats']

/** The fake API origin baked into the bundle by `.env.e2e`; never resolved. */
export const API_ORIGIN = 'https://api.e2e.test'
export const TOKEN = 'e2e-sentinel-token.payload.signature'
export const PASSWORD = 'Sentinel-Password-e2e'
export const EMAIL = 'staff@e2e.test'

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const SELF_USER_ID = '22222222-2222-4222-8222-222222222222'

const stamp = '2026-01-15T10:00:00Z'
const user = (
  n: number,
  email: string,
  status: UserRead['status']
): UserRead => ({
  id: `3333333${n}-3333-4333-8333-333333333333`,
  email,
  display_name: null,
  email_verified_at: stamp,
  status,
  created_at: stamp,
  updated_at: stamp,
})
const USERS: UserRead[] = [
  user(1, 'ada@people.e2e.test', 'active'),
  user(2, 'bob@people.e2e.test', 'active'),
  user(3, 'cy@people.e2e.test', 'disabled'),
]

const org = (
  n: number,
  slug: string,
  name: string,
  status: OrganizationRead['status'],
  description: string | null
): OrganizationRead => ({
  id: `4444444${n}-4444-4444-8444-444444444444`,
  slug,
  name,
  description,
  status,
  created_by: null,
  created_at: stamp,
  updated_at: stamp,
})
const ORGS: OrganizationRead[] = [
  org(1, 'acme', 'Acme Corp', 'active', 'Rockets and anvils'),
  org(2, 'globex', 'Globex', 'suspended', null),
  org(3, 'initech', 'Initech', 'active', 'TPS reports'),
]

const CALECHIP_MEMBER_ID = 'c1000001-0000-4000-8000-000000000001'
const CALECHIP_OWNER_ID = 'c1000002-0000-4000-8000-000000000002'

const app = (
  n: number,
  key: string,
  name: string,
  over: Partial<AppRead>
): AppRead => ({
  id: `5555555${n}-5555-4555-8555-555555555555`,
  key,
  name,
  status: 'active',
  join_policy: 'approval',
  org_mode: 'none',
  origins: [],
  default_role_id: null,
  org_owner_role_id: null,
  member_count: 0,
  created_at: stamp,
  updated_at: stamp,
  ...over,
})
// Ordered by key, like the API.
const APPS: AppRead[] = [
  app(1, 'admin', 'Admin console', {
    join_policy: 'closed',
    origins: ['https://admin-portal.mmlabs.online'],
  }),
  app(2, 'calechip', 'Calechip', {
    join_policy: 'open',
    org_mode: 'required',
    default_role_id: CALECHIP_MEMBER_ID,
    org_owner_role_id: CALECHIP_OWNER_ID,
  }),
  app(3, 'stoktok', 'Stoktok', {
    origins: ['https://stoktok.mmlabs.online', 'http://localhost:5173'],
  }),
]
// Consistent with USERS / ORGS / APPS. Months are fixed (no Date) so runs are stable.
const STATS: DashboardStats = {
  generated_at: '2026-11-18T03:00:00Z',
  users: { total: 3, by_status: { active: 2, disabled: 1 }, unverified: 0 },
  organizations: { total: 3, by_status: { active: 2, suspended: 1 } },
  apps: { total: 3, by_status: { active: 3, disabled: 0 } },
  sign_ins_24h: {
    window_start: '2026-11-17T03:00:00Z',
    window_end: '2026-11-18T03:00:00Z',
    succeeded: 4,
    failed: 1,
  },
  sign_ups: {
    time_zone: 'Asia/Ho_Chi_Minh',
    by_month: [
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ].map((month, i) => ({ month, count: i + 1 })),
  },
  members_per_app: APPS.map((a) => ({
    app_key: a.key,
    name: a.name,
    member_count: a.member_count,
  })),
}
const permission = (
  n: number,
  key: string,
  over: Partial<PermissionRead> = {}
): PermissionRead => ({
  id: `6666666${n}-6666-4666-8666-666666666666`,
  key,
  description: null,
  is_admin: false,
  scope: 'app',
  ...over,
})
const PERMISSIONS: Record<string, PermissionRead[]> = {
  admin: [permission(1, 'admin:*', { is_admin: true })],
  calechip: [],
  stoktok: [
    permission(2, 'stoktok:orders:read', { description: 'View orders' }),
    permission(3, 'stoktok:orders:write', { is_admin: true }),
  ],
}

const roleDef = (
  appKey: string,
  id: string,
  seg: string,
  name: string,
  over: Partial<RoleDefinitionRead> = {}
): RoleDefinitionRead => ({
  id,
  app: appKey,
  key: `${appKey}:${seg}`,
  name,
  is_system: false,
  is_default: false,
  privileged: false,
  permissions: [],
  created_at: stamp,
  updated_at: stamp,
  ...over,
})
// Ordered by key, like the API.
const ROLES: Record<string, RoleDefinitionRead[]> = {
  admin: [
    roleDef(
      'admin',
      'b1000001-0000-4000-8000-000000000001',
      'super-admin',
      'Super admin',
      { is_system: true, privileged: true, permissions: ['admin:*'] }
    ),
  ],
  calechip: [
    roleDef('calechip', CALECHIP_MEMBER_ID, 'member', 'Member', {
      is_default: true,
    }),
    roleDef('calechip', CALECHIP_OWNER_ID, 'owner', 'Owner', {
      is_system: true,
    }),
  ],
  stoktok: [
    roleDef(
      'stoktok',
      'd1000002-0000-4000-8000-000000000002',
      'operator',
      'Operator',
      {
        privileged: true,
        permissions: ['stoktok:orders:read', 'stoktok:orders:write'],
      }
    ),
    roleDef(
      'stoktok',
      'd1000001-0000-4000-8000-000000000001',
      'viewer',
      'Viewer',
      { permissions: ['stoktok:orders:read'] }
    ),
  ],
}

// A long unbroken value makes the detail tables and <pre> overflow like real data.
const LONG = 'x'.repeat(200)
const AUDIT_LOGS: AuditLogRead[] = [
  {
    id: '44444444-4444-4444-8444-444444444441',
    action: 'user.update',
    actor_kind: 'user',
    actor_label: 'staff@e2e.test',
    actor_user_id: SELF_USER_ID,
    app_key: 'admin',
    changes: { status: { from: 'active', to: 'disabled' }, note: LONG },
    ip: null,
    occurred_at: stamp,
    org_id: null,
    outcome: 'success',
    request_id: 'req-e2e-1',
    target_id: USERS[2].id,
    target_type: 'user',
    user_agent: null,
  },
  {
    id: '44444444-4444-4444-8444-444444444442',
    action: 'role.create',
    actor_kind: 'user',
    actor_label: 'staff@e2e.test',
    actor_user_id: SELF_USER_ID,
    app_key: 'admin',
    changes: null,
    ip: null,
    occurred_at: stamp,
    org_id: null,
    outcome: 'denied',
    request_id: null,
    target_id: null,
    target_type: 'role',
    user_agent: null,
  },
]

type Call = {
  method: string
  path: string
  query: URLSearchParams
  headers: Record<string, string>
  body: unknown
}

const json = (status: number, body: unknown) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})
const envelope = (status: number, code: string) =>
  json(status, { error: { code, message: code, details: null } })

function page<T>(items: T[], q: URLSearchParams) {
  const limit = Number(q.get('limit') ?? 20)
  const offset = Number(q.get('offset') ?? 0)
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  }
}

/**
 * Answers every request to API_ORIGIN at the network layer (the app has no
 * test hooks). `state.signedIn` stands in for the HttpOnly mm_device cookie.
 */
export async function installFakeApi(context: BrowserContext) {
  const state = { signedIn: false }
  const calls: Call[] = []
  const unmatched: string[] = []

  const account = () => ({
    account_id: ACCOUNT_ID,
    email: EMAIL,
    email_verified: true,
    display_name: null,
  })

  const routes: Record<string, (c: Call) => ReturnType<typeof json> | null> = {
    'GET /api/v1/auth/accounts': () =>
      state.signedIn
        ? json(200, { items: [account()] })
        : envelope(401, 'session_invalid'),
    'POST /api/v1/auth/login': ({ body }) => {
      if ((body as { password?: string }).password !== PASSWORD) {
        return envelope(401, 'invalid_credentials')
      }
      state.signedIn = true
      return json(200, {
        account_id: ACCOUNT_ID,
        user: { id: SELF_USER_ID, email: EMAIL, email_verified: true },
      })
    },
    'POST /api/v1/auth/token': () =>
      state.signedIn
        ? json(200, {
            access_token: TOKEN,
            token_type: 'Bearer',
            expires_in: 900,
            audience: 'admin',
          })
        : envelope(401, 'session_invalid'),
    'POST /api/v1/auth/logout': () => {
      state.signedIn = false
      return null
    },
    'GET /api/v1/me/permissions': () =>
      json(200, {
        user_id: SELF_USER_ID,
        roles: ['admin'],
        permissions: ['admin:*'],
      } satisfies MePermissions),
    'GET /api/v1/users': ({ query }) => {
      const email = query.get('email')?.toLowerCase()
      const status = query.get('status')
      return json(
        200,
        page(
          USERS.filter(
            (u) =>
              (!email || u.email.toLowerCase().includes(email)) &&
              (!status || u.status === status)
          ),
          query
        )
      )
    },
    'GET /api/v1/organizations': ({ query }) => json(200, page(ORGS, query)),
    'GET /api/v1/audit-logs': ({ query }) => json(200, page(AUDIT_LOGS, query)),
    'GET /api/v1/apps': ({ query }) => json(200, page(APPS, query)),
    'GET /api/v1/stats/dashboard': () => json(200, STATS),
  }
  // User detail and role assignments. Per-install: empty at start; POST adds a
  // row like the API (unknown role 422, same role and org 409) and DELETE
  // removes it (404 once gone).
  const assignments: Record<string, AssignmentRead[]> = {}
  let assignmentCount = 0
  const addDeleteAssignmentRoute = (u: UserRead, row: AssignmentRead) => {
    routes[`DELETE /api/v1/users/${u.id}/role-assignments/${row.id}`] = () => {
      const i = assignments[u.id].indexOf(row)
      if (i < 0) return envelope(404, 'not_found')
      assignments[u.id].splice(i, 1)
      return null
    }
  }
  for (const u of USERS) {
    assignments[u.id] = []
    routes[`GET /api/v1/users/${u.id}`] = () => json(200, u)
    routes[`GET /api/v1/users/${u.id}/role-assignments`] = ({ query }) =>
      json(200, page(assignments[u.id], query))
    routes[`POST /api/v1/users/${u.id}/role-assignments`] = ({ body }) => {
      const b = body as { role_id: string; org_id?: string }
      const role = Object.values(ROLES)
        .flat()
        .find((r) => r.id === b.role_id)
      if (!role)
        return json(422, {
          error: {
            code: 'unprocessable',
            message: 'unprocessable',
            details: [{ field: 'role_id', reason: 'unknown_role' }],
          },
        })
      const orgId = b.org_id ?? null
      if (
        assignments[u.id].some(
          (a) => a.role_id === role.id && a.org_id === orgId
        )
      )
        return envelope(409, 'conflict')
      const row: AssignmentRead = {
        id: `eeeeeee${++assignmentCount}-eeee-4eee-8eee-eeeeeeeeeeee`,
        app: role.app,
        role_id: role.id,
        role_key: role.key,
        org_id: orgId,
        granted_by: SELF_USER_ID,
        expires_at: null,
        active: true,
        created_at: stamp,
      }
      assignments[u.id].unshift(row)
      addDeleteAssignmentRoute(u, row)
      return json(201, row)
    }
  }
  // Holders of a role: the assignments above joined with USERS.
  const holdersOf = (roleId: string): RoleHolderRead[] =>
    USERS.flatMap((u) =>
      assignments[u.id]
        .filter((a) => a.role_id === roleId)
        .map((a) => ({
          ...a,
          user_id: u.id,
          email: u.email,
          display_name: u.display_name,
          user_status: u.status,
        }))
    )
  // Per-install sessions: only ada has any. Revoke removes rows like the API
  // (revoke-one 404s once the row is gone).
  const LONG_UA = 'Mozilla/5.0 (E2E) ' + 'Gecko/20100101 '.repeat(8)
  const sessionRow = (
    n: number,
    over: Partial<UserSessionRead> = {}
  ): UserSessionRead => ({
    id: `aaaaaaa${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    created_at: `2026-03-0${n}T10:00:00Z`,
    last_used_at: `2026-04-0${n}T10:00:00Z`,
    device_last_seen_at: `2026-05-0${n}T10:00:00Z`,
    ip: null,
    user_agent: null,
    ...over,
  })
  const sessions: Record<string, UserSessionRead[]> = {
    [USERS[0].id]: [
      sessionRow(1, { ip: '203.0.113.7', user_agent: LONG_UA }),
      sessionRow(2),
    ],
    [USERS[1].id]: [],
    [USERS[2].id]: [],
  }
  for (const u of USERS) {
    routes[`GET /api/v1/users/${u.id}/sessions`] = ({ query }) =>
      json(200, page(sessions[u.id], query))
    routes[`DELETE /api/v1/users/${u.id}/sessions`] = () => {
      sessions[u.id].length = 0
      return null
    }
    for (const row of sessions[u.id])
      routes[`DELETE /api/v1/users/${u.id}/sessions/${row.id}`] = () => {
        const i = sessions[u.id].indexOf(row)
        if (i < 0) return envelope(404, 'not_found')
        sessions[u.id].splice(i, 1)
        return null
      }
  }
  // Per-install credential state: issue adds a row, revoke clears `active`.
  // Only the fake constant is ever served as a credential value.
  const creds: Record<string, AppCredentialRead[]> = {
    admin: [],
    calechip: [],
    stoktok: [
      {
        id: '77777770-7777-4777-8777-777777777777',
        app: 'stoktok',
        key_id: 'e2e0000000000001',
        active: true,
        created_at: stamp,
        created_by: null,
        last_used_at: null,
        revoked_at: null,
      },
    ],
  }
  const addRevokeRoute = (appKey: string, c: AppCredentialRead) => {
    routes[`DELETE /api/v1/apps/${appKey}/credentials/${c.id}`] = () => {
      c.active = false
      c.revoked_at = stamp
      return null
    }
  }
  // Per-install join requests: approve/reject set the status like the API.
  const joinRequest = (u: UserRead, display_name: string | null) =>
    ({
      id: `9999999${u.id[7]}-9999-4999-8999-999999999999`,
      app_key: 'stoktok',
      user_id: u.id,
      email: u.email,
      display_name,
      email_verified: true,
      user_status: 'active',
      status: 'pending',
      created_at: stamp,
      decided_at: null,
      decided_by: null,
    }) satisfies JoinRequestRead
  const joins: Record<string, JoinRequestRead[]> = {
    admin: [],
    calechip: [],
    stoktok: [
      joinRequest(USERS[0], 'Ada Lovelace'),
      joinRequest(USERS[1], null),
    ],
  }
  const addDecisionRoutes = (appKey: string, r: JoinRequestRead) => {
    for (const decision of ['approve', 'reject'] as const)
      routes[`POST /api/v1/apps/${appKey}/join-requests/${r.id}/${decision}`] =
        () => {
          if (r.status !== 'pending')
            return json(409, {
              error: {
                code: 'conflict',
                message: 'conflict',
                details: [{ field: 'request_id', reason: 'not_pending' }],
              },
            })
          r.status = decision === 'approve' ? 'approved' : 'rejected'
          r.decided_at = stamp
          r.decided_by = SELF_USER_ID
          return json(200, r)
        }
  }
  for (const a of APPS) {
    routes[`GET /api/v1/apps/${a.key}/join-requests`] = ({ query }) =>
      a.key === 'admin'
        ? envelope(404, 'not_found')
        : json(
            200,
            page(
              joins[a.key].filter(
                (r) => r.status === (query.get('status') ?? 'pending')
              ),
              query
            )
          )
    for (const r of joins[a.key]) addDecisionRoutes(a.key, r)
    routes[`GET /api/v1/apps/${a.key}`] = () => json(200, a)
    routes[`GET /api/v1/apps/${a.key}/permissions`] = ({ query }) =>
      json(200, page(PERMISSIONS[a.key] ?? [], query))
    routes[`GET /api/v1/apps/${a.key}/role-definitions`] = ({ query }) =>
      json(200, page(ROLES[a.key] ?? [], query))
    for (const r of ROLES[a.key] ?? []) {
      routes[`GET /api/v1/apps/${a.key}/role-definitions/${r.id}`] = () =>
        json(200, r)
      routes[`GET /api/v1/apps/${a.key}/role-definitions/${r.id}/assignments`] =
        ({ query }) => json(200, page(holdersOf(r.id), query))
    }
    routes[`GET /api/v1/apps/${a.key}/credentials`] = ({ query }) =>
      json(200, page(creds[a.key], query))
    for (const c of creds[a.key]) addRevokeRoute(a.key, c)
    routes[`POST /api/v1/apps/${a.key}/credentials`] = () => {
      const reason = (r: string) =>
        json(409, {
          error: {
            code: 'conflict',
            message: 'conflict',
            details: [{ field: 'key', reason: r }],
          },
        })
      if (a.key === 'admin') return reason('admin_app')
      if (a.status === 'disabled') return reason('app_disabled')
      if (creds[a.key].filter((c) => c.active).length >= 2)
        return reason('credential_limit')
      const row: AppCredentialRead = {
        id: '77777771-7777-4777-8777-777777777777',
        app: a.key,
        key_id: FAKE_KEY_ID,
        active: true,
        created_at: stamp,
        created_by: null,
        last_used_at: null,
        revoked_at: null,
      }
      creds[a.key].unshift(row)
      addRevokeRoute(a.key, row)
      return json(201, { ...row, credential: FAKE_CREDENTIAL })
    }
  }

  // Per-install entitlements: grant adds a row, PATCH changes it. `active`
  // is computed here because the fake stands in for the API (the UI never does).
  const ents: Record<string, EntitlementRead[]> = {
    [ORGS[0].id]: [],
    [ORGS[1].id]: [
      {
        id: '88888881-8888-4888-8888-888888888888',
        org_id: ORGS[1].id,
        app_key: 'calechip',
        plan: 'pro',
        limits: { seats: 5 },
        enabled: true,
        active: false,
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    [ORGS[2].id]: [],
  }
  const addPatchRoute = (o: OrganizationRead, e: EntitlementRead) => {
    routes[`PATCH /api/v1/organizations/${o.id}/entitlements/${e.id}`] = ({
      body,
    }) => {
      const b = body as Partial<EntitlementRead>
      if (b.plan != null) e.plan = b.plan
      if (b.limits != null) e.limits = b.limits
      if (b.enabled != null) e.enabled = b.enabled
      e.active = e.enabled && o.status === 'active'
      e.updated_at = '2026-01-16T10:00:00Z'
      return json(200, e)
    }
  }
  for (const o of ORGS) {
    routes[`GET /api/v1/organizations/${o.id}`] = () => json(200, o)
    routes[`GET /api/v1/organizations/${o.id}/entitlements`] = ({ query }) =>
      json(200, page(ents[o.id], query))
    for (const e of ents[o.id]) addPatchRoute(o, e)
    routes[`POST /api/v1/organizations/${o.id}/entitlements`] = ({ body }) => {
      const b = body as { app_key: string; plan: string; enabled?: boolean }
      const target = APPS.find((a) => a.key === b.app_key)
      const reason = (r: string) =>
        json(409, {
          error: {
            code: 'conflict',
            message: 'conflict',
            details: [{ field: 'app_key', reason: r }],
          },
        })
      if (!target)
        return json(404, {
          error: {
            code: 'not_found',
            message: 'not_found',
            details: [{ field: 'app_key', reason: 'unknown_app' }],
          },
        })
      if (target.key === 'admin') return reason('admin_app')
      if (target.status === 'disabled') return reason('app_disabled')
      if (target.org_mode !== 'required') return reason('org_mode_none')
      if (ents[o.id].some((e) => e.app_key === b.app_key))
        return reason('entitlement_exists')
      const enabled = b.enabled ?? true
      const row: EntitlementRead = {
        id: '88888882-8888-4888-8888-888888888888',
        org_id: o.id,
        app_key: b.app_key,
        plan: b.plan,
        limits: (body as { limits?: Record<string, number> }).limits ?? {},
        enabled,
        active: enabled && o.status === 'active' && target.status === 'active',
        created_at: stamp,
        updated_at: stamp,
      }
      ents[o.id].push(row)
      addPatchRoute(o, row)
      return json(201, row)
    }
  }

  await context.route(`${API_ORIGIN}/**`, async (route: Route) => {
    const req = route.request()
    const url = new URL(req.url())
    const origin = req.headers()['origin'] ?? '*'
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      vary: 'Origin',
    }
    if (req.method() === 'OPTIONS') {
      calls.push({
        method: 'OPTIONS',
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers(),
        body: undefined,
      })
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers':
            req.headers()['access-control-request-headers'] ?? '*',
        },
      })
    }
    const call: Call = {
      method: req.method(),
      path: url.pathname,
      query: url.searchParams,
      headers: req.headers(),
      body: req.postData() ? req.postDataJSON() : undefined,
    }
    calls.push(call)
    const key = `${call.method} ${call.path}`
    const handler = routes[key]
    if (!handler) {
      unmatched.push(key)
      return route.fulfill({ ...envelope(501, 'not_faked'), headers: cors })
    }
    if (
      !call.path.startsWith('/api/v1/auth/') &&
      call.headers['authorization'] !== `Bearer ${TOKEN}`
    ) {
      unmatched.push(`${key} (missing bearer)`)
      return route.fulfill({
        ...envelope(401, 'session_invalid'),
        headers: cors,
      })
    }
    const res = handler(call)
    if (!res) return route.fulfill({ status: 204, headers: cors })
    return route.fulfill({ ...res, headers: cors })
  })

  return {
    state,
    calls,
    unmatched,
    count: (key: string) =>
      calls.filter((c) => `${c.method} ${c.path}` === key).length,
  }
}
export type FakeApi = Awaited<ReturnType<typeof installFakeApi>>
