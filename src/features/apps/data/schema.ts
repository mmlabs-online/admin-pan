import { z } from 'zod'

// Mirrors org-admin-api USR-02 tables (apps, permissions, roles,
// role_permissions, role_assignments) — docs/identity-architecture.md.

export const appStatusSchema = z.enum(['active', 'disabled'])
export type AppStatus = z.infer<typeof appStatusSchema>

export const joinPolicySchema = z.enum(['open', 'approval', 'closed'])
export type JoinPolicy = z.infer<typeof joinPolicySchema>

export const orgModeSchema = z.enum(['none', 'required'])
export type OrgMode = z.infer<typeof orgModeSchema>

export const appSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  status: appStatusSchema,
  join_policy: joinPolicySchema,
  default_role_id: z.uuid().nullable(),
  org_mode: orgModeSchema,
  origins: z.array(z.string()),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
})
export type App = z.infer<typeof appSchema>

export const permissionSchema = z.object({
  id: z.uuid(),
  app_id: z.uuid(),
  // '<app>:<resource>:<action>'
  key: z.string(),
  description: z.string(),
  is_admin: z.boolean(),
})
export type Permission = z.infer<typeof permissionSchema>

export const roleSchema = z.object({
  id: z.uuid(),
  app_id: z.uuid(),
  key: z.string(),
  name: z.string(),
  is_system: z.boolean(),
})
export type Role = z.infer<typeof roleSchema>

export const rolePermissionSchema = z.object({
  role_id: z.uuid(),
  permission_id: z.uuid(),
})
export type RolePermission = z.infer<typeof rolePermissionSchema>

export const roleAssignmentSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  role_id: z.uuid(),
  org_id: z.uuid().nullable(),
  granted_by: z.uuid(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
})
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>

// Lookup rows used only to display assignment targets (email / org name).
// Replaced by the users and organizations endpoints in a later ticket.
const userRefSchema = z.object({ id: z.uuid(), email: z.string() })

const orgRefSchema = z.object({ id: z.uuid(), name: z.string() })

export const accessDataSchema = z.object({
  apps: z.array(appSchema),
  permissions: z.array(permissionSchema),
  roles: z.array(roleSchema),
  role_permissions: z.array(rolePermissionSchema),
  role_assignments: z.array(roleAssignmentSchema),
  users: z.array(userRefSchema),
  orgs: z.array(orgRefSchema),
  // Mock only: org-admin-api has no member count per app yet (follow-up).
  app_member_counts: z.record(z.string(), z.number()),
})
export type AccessData = z.infer<typeof accessDataSchema>
