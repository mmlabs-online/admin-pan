import { z } from 'zod'
import { type components } from '@/api'

// Generated from org-admin-api OpenAPI (R2); never hand-copy these shapes.
export type RoleDefinition = components['schemas']['RoleDefinitionRead']
export type Role = components['schemas']['RoleRead']
export type RoleCreate = components['schemas']['RoleCreate']
export type RoleUpdate = components['schemas']['RoleUpdate']
export type RolePermissionsReplace =
  components['schemas']['RolePermissionsReplace']

// Limits of `RoleCreate` / `RolePermissionsReplace` (openapi.json);
// role-schema.test.ts guards drift.
export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9-]{1,31}:[a-z][a-z0-9-]{0,47}$/
export const ROLE_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{0,47}$/
export const ROLE_NAME_MAX = 255
export const PERMISSION_KEYS_MAX = 200
export const SUPER_ADMIN_ROLE_KEY = 'admin:super-admin'
export const WILDCARD = 'admin:*'

const name = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(ROLE_NAME_MAX, `Use at most ${ROLE_NAME_MAX} characters.`)

// Create form: the app prefix is shown read-only and joined when sending.
export const roleCreateSchema = z.object({
  segment: z
    .string()
    .trim()
    .min(1, 'Key is required.')
    .regex(
      ROLE_SEGMENT_PATTERN,
      'Use 1–48 lowercase letters, digits and hyphens, starting with a letter.'
    ),
  name,
})
export type RoleCreateForm = z.infer<typeof roleCreateSchema>

export const roleRenameSchema = z.object({ name })
export type RoleRenameForm = z.infer<typeof roleRenameSchema>

// URL state of /roles: the app and paging only. Old ?filter= and ?app[]= keys
// are dropped (the list has no search; the app is one key).
export const rolesSearchSchema = z.object({
  app: z.string().optional().catch(undefined),
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
})
