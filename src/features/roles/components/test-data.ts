import { type App, type Permission } from '@/features/apps/data/app-schema'
import { type RoleDefinition } from '../data/role-schema'

const stamp = '2026-01-05T10:00:00.000Z'

export const CAL_MEMBER_ID = 'c1000001-0000-4000-8000-000000000001'
export const CAL_OWNER_ID = 'c1000002-0000-4000-8000-000000000002'

const app = (
  n: number,
  key: string,
  name: string,
  over: Partial<App>
): App => ({
  id: `a000000${n}-0000-4000-8000-000000000000`,
  key,
  name,
  status: 'active',
  join_policy: 'open',
  org_mode: 'none',
  origins: [],
  default_role_id: null,
  org_owner_role_id: null,
  member_count: 0,
  created_at: stamp,
  updated_at: stamp,
  ...over,
})

export const APPS: App[] = [
  app(1, 'admin', 'Admin console', { join_policy: 'closed' }),
  app(2, 'calechip', 'Calechip', {
    org_mode: 'required',
    default_role_id: CAL_MEMBER_ID,
    org_owner_role_id: CAL_OWNER_ID,
  }),
  app(3, 'legacy', 'Legacy', { status: 'disabled' }),
  app(4, 'stoktok', 'Stoktok', {}),
]

export const role = (
  appKey: string,
  id: string,
  seg: string,
  over: Partial<RoleDefinition> = {}
): RoleDefinition => ({
  id,
  app: appKey,
  key: `${appKey}:${seg}`,
  name: seg[0].toUpperCase() + seg.slice(1),
  is_system: false,
  is_default: false,
  privileged: false,
  permissions: [],
  created_at: stamp,
  updated_at: stamp,
  ...over,
})

export const VIEWER_ID = 'd1000001-0000-4000-8000-000000000001'
export const OPERATOR_ID = 'd1000002-0000-4000-8000-000000000002'
export const SUPER_ADMIN_ID = 'b1000001-0000-4000-8000-000000000001'

export const ROLES: Record<string, RoleDefinition[]> = {
  admin: [
    role('admin', SUPER_ADMIN_ID, 'super-admin', {
      name: 'Super admin',
      is_system: true,
      privileged: true,
      permissions: ['admin:*'],
    }),
  ],
  calechip: [
    role('calechip', CAL_MEMBER_ID, 'member', {
      is_default: true,
      permissions: ['calechip:orders:read'],
    }),
    role('calechip', CAL_OWNER_ID, 'owner', {
      is_system: true,
      permissions: ['calechip:orders:read', 'calechip:orgs:manage'],
    }),
  ],
  legacy: [],
  stoktok: [
    role('stoktok', VIEWER_ID, 'viewer', {
      permissions: ['stoktok:orders:read'],
    }),
    role('stoktok', OPERATOR_ID, 'operator', {
      privileged: true,
      permissions: ['stoktok:orders:read', 'stoktok:orders:write'],
    }),
  ],
}

const permission = (
  n: number,
  key: string,
  over: Partial<Permission> = {}
): Permission => ({
  id: `f000000${n}-0000-4000-8000-000000000000`,
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
  calechip: [
    permission(3, 'calechip:orders:read', { description: 'View orders' }),
    permission(4, 'calechip:orgs:manage', { scope: 'org' }),
  ],
  legacy: [],
  stoktok: [
    permission(5, 'stoktok:orders:read', { description: 'View orders' }),
    permission(6, 'stoktok:orders:write', { is_admin: true }),
  ],
}

/** A `Page<T>` body. */
export const pageOf = <T>(
  items: T[],
  limit = 10,
  offset = 0,
  total?: number
) => ({
  items: items.slice(offset, offset + limit),
  total: total ?? items.length,
  limit,
  offset,
})
