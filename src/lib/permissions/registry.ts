// The one typed registry of the admin:* permissions the UI mirrors (R4, ADR 0004).
// Hand-written; registry.test.ts checks every entry against the x-permission
// of the operations it names in src/api/openapi.json, so drift fails the tests.
import { type paths } from '@/api'
import { type FileRoutesById } from '@/routeTree.gen'

export const ADMIN_PERMISSIONS = [
  'admin:*',
  'admin:apps:read',
  'admin:apps:write',
  'admin:audit:read',
  'admin:entitlements:read',
  'admin:entitlements:write',
  'admin:organizations:read',
  'admin:organizations:write',
  'admin:roles:assign',
  'admin:roles:manage',
  'admin:stats:read',
  'admin:users:read',
  'admin:users:write',
] as const

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]

/** org-admin-api app/modules/admin_auth/deps.py key pattern. */
export const ADMIN_PERMISSION_PATTERN =
  /^admin:([a-z][a-z0-9-]{0,47}:[a-z][a-z0-9-]{0,47}|\*)$/

export type ApiOperation =
  `${'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'} ${keyof paths & string}`

export type Requirement =
  | {
      kind: 'permission'
      permission: AdminPermission
      operations: readonly ApiOperation[]
    }
  // The base permission plus admin:* (the API's `x-requires-super`): `always`
  // for every call, `conditional` when it depends on the request body.
  | {
      kind: 'super'
      base: AdminPermission
      when: 'always' | 'conditional'
      operations: readonly ApiOperation[]
    }
  // No admin endpoint in our OpenAPI snapshot yet.
  | { kind: 'pending'; ticket: `PAN-${string}`; reason: string }
  // Never calls an admin endpoint.
  | { kind: 'none'; reason: string }

function perm(
  permission: AdminPermission,
  ...operations: ApiOperation[]
): Requirement {
  return { kind: 'permission', permission, operations }
}

function superOf(
  base: AdminPermission,
  when: 'always' | 'conditional',
  ...operations: ApiOperation[]
): Requirement {
  return { kind: 'super', base, when, operations }
}

const local: Requirement = {
  kind: 'none',
  reason: 'Local preferences or error page; no admin endpoint',
}

export type AuthenticatedRouteId = Extract<
  keyof FileRoutesById,
  `/_authenticated/${string}`
>

export const ROUTE_PERMISSIONS = {
  '/_authenticated/': perm('admin:stats:read', 'GET /api/v1/stats/dashboard'),
  '/_authenticated/users/': perm('admin:users:read', 'GET /api/v1/users'),
  '/_authenticated/organizations/': perm(
    'admin:organizations:read',
    'GET /api/v1/organizations'
  ),
  '/_authenticated/apps/': perm('admin:apps:read', 'GET /api/v1/apps'),
  '/_authenticated/roles/': perm(
    'admin:apps:read',
    'GET /api/v1/apps',
    'GET /api/v1/apps/{key}/role-definitions',
    'GET /api/v1/apps/{key}/role-definitions/{role_id}'
  ),
  '/_authenticated/audit-log/': perm(
    'admin:audit:read',
    'GET /api/v1/audit-logs'
  ),
  '/_authenticated/reports/': {
    kind: 'pending',
    ticket: 'PAN-021',
    reason: 'No reports API (spec §8 Q7)',
  },
  '/_authenticated/settings': local,
  '/_authenticated/settings/': local,
  '/_authenticated/settings/account': local,
  '/_authenticated/settings/appearance': local,
  '/_authenticated/settings/display': local,
  '/_authenticated/settings/notifications': local,
  '/_authenticated/errors/$error': local,
} as const satisfies Record<AuthenticatedRouteId, Requirement>

const reportsPending: Requirement = {
  kind: 'pending',
  ticket: 'PAN-021',
  reason: 'No reports API (spec §8 Q7)',
}

export const ACTIONS = {
  'users.view': perm('admin:users:read', 'GET /api/v1/users/{user_id}'),
  'users.setStatus': perm('admin:users:write', 'PATCH /api/v1/users/{user_id}'),
  'users.viewSessions': perm('admin:*', 'GET /api/v1/users/{user_id}/sessions'),
  'users.revokeSession': perm(
    'admin:*',
    'DELETE /api/v1/users/{user_id}/sessions/{session_id}'
  ),
  'users.revokeAllSessions': perm(
    'admin:*',
    'DELETE /api/v1/users/{user_id}/sessions'
  ),
  'organizations.view': perm(
    'admin:organizations:read',
    'GET /api/v1/organizations/{org_id}'
  ),
  'organizations.viewMembers': perm(
    'admin:users:read',
    'GET /api/v1/organizations/{org_id}/members'
  ),
  'organizations.viewInvitations': perm(
    'admin:organizations:read',
    'GET /api/v1/organizations/{org_id}/invitations'
  ),
  'organizations.create': perm(
    'admin:organizations:write',
    'POST /api/v1/organizations'
  ),
  'organizations.update': perm(
    'admin:organizations:write',
    'PATCH /api/v1/organizations/{org_id}'
  ),
  'organizations.delete': perm(
    'admin:organizations:write',
    'DELETE /api/v1/organizations/{org_id}'
  ),
  'apps.view': perm(
    'admin:apps:read',
    'GET /api/v1/apps/{key}',
    'GET /api/v1/apps/{key}/permissions',
    'GET /api/v1/apps/{key}/credentials'
  ),
  'apps.register': perm('admin:apps:write', 'POST /api/v1/apps'),
  'apps.update': perm('admin:apps:write', 'PATCH /api/v1/apps/{key}'),
  'apps.setSuperAdminRole': superOf(
    'admin:apps:write',
    'conditional',
    'PATCH /api/v1/apps/{key}'
  ),
  'apps.issueCredential': superOf(
    'admin:apps:write',
    'always',
    'POST /api/v1/apps/{key}/credentials'
  ),
  'apps.revokeCredential': perm(
    'admin:apps:write',
    'DELETE /api/v1/apps/{key}/credentials/{credential_id}'
  ),
  'apps.viewJoinRequests': perm(
    'admin:users:read',
    'GET /api/v1/apps/{key}/join-requests'
  ),
  'apps.decideJoinRequest': perm(
    'admin:roles:assign',
    'POST /api/v1/apps/{key}/join-requests/{request_id}/approve',
    'POST /api/v1/apps/{key}/join-requests/{request_id}/reject'
  ),
  'apps.createPermission': perm(
    'admin:roles:manage',
    'POST /api/v1/apps/{key}/permissions'
  ),
  'apps.updatePermission': perm(
    'admin:roles:manage',
    'PATCH /api/v1/apps/{key}/permissions/{permission_id}'
  ),
  'roles.create': perm(
    'admin:roles:manage',
    'POST /api/v1/apps/{key}/roles',
    'PUT /api/v1/apps/{key}/roles/{role_id}/permissions'
  ),
  'roles.rename': perm(
    'admin:roles:manage',
    'PATCH /api/v1/apps/{key}/roles/{role_id}'
  ),
  'roles.setPermissions': perm(
    'admin:roles:manage',
    'PUT /api/v1/apps/{key}/roles/{role_id}/permissions'
  ),
  'roles.setDefault': perm('admin:apps:write', 'PATCH /api/v1/apps/{key}'),
  'roles.delete': perm(
    'admin:roles:manage',
    'DELETE /api/v1/apps/{key}/roles/{role_id}'
  ),
  'roles.viewAssignments': perm(
    'admin:users:read',
    'GET /api/v1/users/{user_id}/role-assignments'
  ),
  'roles.viewHolders': perm(
    'admin:users:read',
    'GET /api/v1/apps/{key}/role-definitions/{role_id}/assignments'
  ),
  'roles.assign': perm(
    'admin:roles:assign',
    'POST /api/v1/users/{user_id}/role-assignments'
  ),
  'roles.revoke': perm(
    'admin:roles:assign',
    'DELETE /api/v1/users/{user_id}/role-assignments/{assignment_id}'
  ),
  'entitlements.view': perm(
    'admin:entitlements:read',
    'GET /api/v1/organizations/{org_id}/entitlements'
  ),
  'entitlements.grant': perm(
    'admin:entitlements:write',
    'POST /api/v1/organizations/{org_id}/entitlements'
  ),
  'entitlements.update': perm(
    'admin:entitlements:write',
    'PATCH /api/v1/organizations/{org_id}/entitlements/{entitlement_id}'
  ),
  'audit.view': perm('admin:audit:read', 'GET /api/v1/audit-logs'),
  'reports.create': reportsPending,
  'reports.update': reportsPending,
  'reports.run': reportsPending,
  'reports.export': reportsPending,
  'reports.delete': reportsPending,
} as const satisfies Record<string, Requirement>

export type ActionId = keyof typeof ACTIONS
