import type { BrowserContext, Route } from '@playwright/test'
import type { components } from '../../src/api/schema'

type UserRead = components['schemas']['UserRead']
type AuditLogRead = components['schemas']['AuditLogRead']
type MePermissions = components['schemas']['MePermissions']

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
    'GET /api/v1/audit-logs': ({ query }) => json(200, page(AUDIT_LOGS, query)),
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
