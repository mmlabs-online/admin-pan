// In-memory store shared by the Apps and Roles screens (mock phase only).
// Every action below maps to an org-admin-api USR-02 endpoint in a later
// ticket; the API owns these rules, the store only mimics them for the mock.
import { useSyncExternalStore } from 'react'
import { CURRENT_STAFF_ID, initialAccessData } from './mock-data'
import {
  type AccessData,
  type App,
  type JoinPolicy,
  type OrgMode,
  type Permission,
  type Role,
  type RoleAssignment,
} from './schema'

let state: AccessData = structuredClone(initialAccessData)
const listeners = new Set<() => void>()

function setState(updater: (prev: AccessData) => AccessData) {
  state = updater(state)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current access data; re-renders the caller whenever it changes. */
export function useAccessData(): AccessData {
  return useSyncExternalStore(subscribe, () => state)
}

/** Test helper: restore the seeded mock data. */
export function resetAccessStore() {
  setState(() => structuredClone(initialAccessData))
}

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

type AppInput = {
  key: string
  name: string
  join_policy: JoinPolicy
  org_mode: OrgMode
  origins: string[]
}

// admin:apps:write (planned name)
export function createApp(input: AppInput): App {
  const timestamp = now()
  const app: App = {
    id: newId(),
    ...input,
    status: 'active',
    default_role_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  }
  // The API seeds each new app with its default `<app>:member` role.
  const memberRole: Role = {
    id: newId(),
    app_id: app.id,
    key: `${app.key}:member`,
    name: 'Member',
    is_system: true,
  }
  app.default_role_id = memberRole.id
  setState((s) => ({
    ...s,
    apps: [...s.apps, app],
    roles: [...s.roles, memberRole],
    app_member_counts: { ...s.app_member_counts, [app.id]: 0 },
  }))
  return app
}

// admin:apps:write (planned name). `key` is immutable after create.
export function updateApp(id: string, input: Omit<AppInput, 'key'>) {
  setState((s) => ({
    ...s,
    apps: s.apps.map((a) =>
      a.id === id ? { ...a, ...input, updated_at: now() } : a
    ),
  }))
}

// admin:apps:write (planned name)
export function setAppStatus(id: string, status: App['status']) {
  setState((s) => ({
    ...s,
    apps: s.apps.map((a) =>
      a.id === id ? { ...a, status, updated_at: now() } : a
    ),
  }))
}

function withDefaultRolePermission(
  s: AccessData,
  permission: Permission,
  granted: boolean
): AccessData['role_permissions'] {
  const app = s.apps.find((a) => a.id === permission.app_id)
  const defaultRoleId = app?.default_role_id
  const rest = s.role_permissions.filter(
    (rp) =>
      !(rp.role_id === defaultRoleId && rp.permission_id === permission.id)
  )
  if (!defaultRoleId || !granted) return rest
  return [...rest, { role_id: defaultRoleId, permission_id: permission.id }]
}

type PermissionInput = {
  key: string
  description: string
  is_admin: boolean
}

// admin:apps:write (planned name)
export function addPermission(appId: string, input: PermissionInput) {
  const permission: Permission = { id: newId(), app_id: appId, ...input }
  setState((s) => {
    const next = { ...s, permissions: [...s.permissions, permission] }
    // The default role holds every non-admin permission of the app.
    return {
      ...next,
      role_permissions: withDefaultRolePermission(
        next,
        permission,
        !permission.is_admin
      ),
    }
  })
  return permission
}

// admin:apps:write (planned name)
export function setPermissionAdmin(permissionId: string, isAdmin: boolean) {
  setState((s) => {
    const permission = s.permissions.find((p) => p.id === permissionId)
    if (!permission) return s
    const updated = { ...permission, is_admin: isAdmin }
    return {
      ...s,
      permissions: s.permissions.map((p) =>
        p.id === permissionId ? updated : p
      ),
      role_permissions: withDefaultRolePermission(s, updated, !isAdmin),
    }
  })
}

type RoleInput = {
  app_id: string
  key: string
  name: string
  permission_ids: string[]
}

// admin:apps:write (planned name)
export function createRole(input: RoleInput): Role {
  const role: Role = {
    id: newId(),
    app_id: input.app_id,
    key: input.key,
    name: input.name,
    is_system: false,
  }
  setState((s) => ({
    ...s,
    roles: [...s.roles, role],
    role_permissions: [
      ...s.role_permissions,
      ...input.permission_ids.map((permission_id) => ({
        role_id: role.id,
        permission_id,
      })),
    ],
  }))
  return role
}

// admin:apps:write (planned name). App and key are immutable after create.
export function updateRole(
  id: string,
  input: { name: string; permission_ids: string[] }
) {
  setState((s) => ({
    ...s,
    roles: s.roles.map((r) => (r.id === id ? { ...r, name: input.name } : r)),
    role_permissions: [
      ...s.role_permissions.filter((rp) => rp.role_id !== id),
      ...input.permission_ids.map((permission_id) => ({
        role_id: id,
        permission_id,
      })),
    ],
  }))
}

// admin:apps:write (planned name). System roles cannot be deleted.
export function deleteRole(id: string) {
  setState((s) => {
    const role = s.roles.find((r) => r.id === id)
    if (!role || role.is_system) return s
    return {
      ...s,
      roles: s.roles.filter((r) => r.id !== id),
      role_permissions: s.role_permissions.filter((rp) => rp.role_id !== id),
      role_assignments: s.role_assignments.filter((ra) => ra.role_id !== id),
    }
  })
}

type AssignmentInput = {
  role_id: string
  user_id: string
  org_id: string | null
  expires_at: string | null
}

// admin:roles:assign (planned name)
export function assignRole(input: AssignmentInput): RoleAssignment {
  const assignment: RoleAssignment = {
    id: newId(),
    ...input,
    granted_by: CURRENT_STAFF_ID,
    created_at: now(),
  }
  setState((s) => ({
    ...s,
    role_assignments: [...s.role_assignments, assignment],
  }))
  return assignment
}

// admin:roles:assign (planned name)
export function revokeAssignment(id: string) {
  setState((s) => ({
    ...s,
    role_assignments: s.role_assignments.filter((ra) => ra.id !== id),
  }))
}
