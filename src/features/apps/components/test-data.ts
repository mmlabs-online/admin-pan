import {
  type App,
  type AppCredential,
  type JoinRequest,
  type Permission,
} from '../data/app-schema'

const stamp = '2026-01-05T10:00:00.000Z'

export const APPS: App[] = [
  {
    id: '1a1a1a1a-1111-4111-8111-111111111111',
    key: 'admin',
    name: 'Admin console',
    status: 'active',
    join_policy: 'closed',
    org_mode: 'none',
    origins: ['https://admin-portal.mmlabs.online'],
    default_role_id: null,
    org_owner_role_id: null,
    created_at: stamp,
    updated_at: stamp,
  },
  {
    id: '2b2b2b2b-2222-4222-8222-222222222222',
    key: 'calechip',
    name: 'Calechip',
    status: 'active',
    join_policy: 'open',
    org_mode: 'required',
    origins: [],
    default_role_id: null,
    org_owner_role_id: '5e5e5e5e-5555-4555-8555-555555555555',
    created_at: stamp,
    updated_at: stamp,
  },
  {
    id: '3c3c3c3c-3333-4333-8333-333333333333',
    key: 'stoktok',
    name: 'Stoktok',
    status: 'disabled',
    join_policy: 'approval',
    org_mode: 'none',
    origins: ['https://stoktok.mmlabs.online', 'http://localhost:5173'],
    default_role_id: '4d4d4d4d-4444-4444-8444-444444444444',
    org_owner_role_id: null,
    created_at: stamp,
    updated_at: '2026-02-10T10:00:00.000Z',
  },
]

const permission = (
  n: number,
  key: string,
  over: Partial<Permission> = {}
): Permission => ({
  id: `6f6f6f6${n}-6666-4666-8666-666666666666`,
  key,
  description: null,
  is_admin: false,
  scope: 'app',
  ...over,
})

export const PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    permission(1, 'admin:*', { is_admin: true, description: 'Everything' }),
    permission(2, 'admin:apps:read', { is_admin: true }),
  ],
  calechip: [],
  stoktok: [
    permission(3, 'stoktok:orders:read', { description: 'View orders' }),
    permission(4, 'stoktok:orders:write', { is_admin: true, scope: 'org' }),
  ],
}

/** A `Page<AppRead>` body. */
export const appsPage = (
  items: App[] = APPS,
  total = items.length,
  limit = 10,
  offset = 0
) => ({ items, total, limit, offset })

/** A `Page<PermissionRead>` body. */
export const permissionsPage = (
  items: Permission[],
  total = items.length,
  limit = 50,
  offset = 0
) => ({ items, total, limit, offset })

const credential = (
  n: number,
  app: string,
  over: Partial<AppCredential> = {}
): AppCredential => ({
  id: `7a7a7a7${n}-7777-4777-8777-777777777777`,
  app,
  key_id: `aaaa00000000000${n}`,
  active: true,
  created_at: '2026-03-01T10:00:00.000Z',
  created_by: null,
  last_used_at: null,
  revoked_at: null,
  ...over,
})

export const CREDENTIALS: Record<string, AppCredential[]> = {
  admin: [],
  calechip: [credential(2, 'calechip')],
  stoktok: [
    credential(1, 'stoktok', { last_used_at: '2026-04-01T10:00:00.000Z' }),
    credential(3, 'stoktok', {
      active: false,
      revoked_at: '2026-03-20T10:00:00.000Z',
    }),
  ],
}

/** A `Page<AppCredentialRead>` body. */
export const credentialsPage = (
  items: AppCredential[],
  total = items.length,
  limit = 20,
  offset = 0
) => ({ items, total, limit, offset })

export const SELF_USER_ID = 'a0a0a0a0-0000-4000-8000-000000000001'

const joinRequest = (
  n: number,
  over: Partial<JoinRequest> = {}
): JoinRequest => ({
  id: `8b8b8b8${n}-8888-4888-8888-888888888888`,
  app_key: 'stoktok',
  user_id: `9c9c9c9${n}-9999-4999-8999-999999999999`,
  email: `person${n}@people.test`,
  display_name: null,
  email_verified: true,
  user_status: 'active',
  status: 'pending',
  created_at: '2026-05-01T10:00:00.000Z',
  decided_at: null,
  decided_by: null,
  ...over,
})

export const JOIN_REQUESTS: JoinRequest[] = [
  joinRequest(1, { display_name: 'Ada Lovelace', email: 'ada@people.test' }),
  joinRequest(2),
  joinRequest(3, {
    email_verified: false,
    user_status: 'disabled',
  }),
]

/** A `Page<JoinRequestRead>` body. */
export const joinRequestsPage = (
  items: JoinRequest[],
  total = items.length,
  limit = 20,
  offset = 0
) => ({ items, total, limit, offset })
