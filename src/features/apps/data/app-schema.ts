import { z } from 'zod'
import { type components, type paths } from '@/api'
import { searchTermSchema } from '@/lib/list-search'

// Generated from org-admin-api OpenAPI (R2); never hand-copy these shapes.
export type App = components['schemas']['AppRead']
export type AppStatus = components['schemas']['AppStatus']
export type JoinPolicy = components['schemas']['JoinPolicy']
export type OrgMode = components['schemas']['OrgMode']
export type Permission = components['schemas']['PermissionRead']
export type PermissionScope = components['schemas']['PermissionScope']
export type AppCredential = components['schemas']['AppCredentialRead']
export type AppCredentialScope = components['schemas']['AppCredentialScope']
export type JoinRequest = components['schemas']['JoinRequestRead']

export const ADMIN_APP_KEY = 'admin'

// The role selects use a sentinel for "None": Radix Select forbids ''.
export const ROLE_NONE = 'none'
export const APP_ROLE_FIELDS = [
  'default_role_id',
  'org_owner_role_id',
  'super_admin_role_id',
] as const
export type AppRoleField = (typeof APP_ROLE_FIELDS)[number]

// Limits of `AppCreate` / `PermissionCreate` (openapi.json) and of
// org-admin-api origins.py; app-schema.test.ts guards drift where the
// snapshot carries them.
export const APP_KEY_PATTERN = /^[a-z][a-z0-9-]{1,31}$/
export const APP_KEY_MAX = 32
export const NAME_MAX = 255
export const ORIGINS_MAX = 20
export const ORIGIN_MAX = 255
export const PERMISSION_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{0,47}$/
export const DESCRIPTION_MAX = 500

const normalizeOrigin = (value: string) =>
  value.trim().toLowerCase().replace(/\/+$/, '')

// Register/edit form. Hosts and schemes are the API's rules (D19): its 422 is
// shown on the origins fieldset, so none are re-implemented here.
export const appFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Key is required.')
    .max(APP_KEY_MAX, `Use at most ${APP_KEY_MAX} characters.`)
    .regex(
      APP_KEY_PATTERN,
      'Use 2–32 lowercase letters, digits and hyphens, starting with a letter.'
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(NAME_MAX, `Use at most ${NAME_MAX} characters.`),
  join_policy: z.enum(['open', 'approval', 'closed']),
  org_mode: z.enum(['none', 'required']),
  default_role_id: z.string(),
  org_owner_role_id: z.string(),
  super_admin_role_id: z.string(),
  origins: z
    .array(
      z.object({
        value: z
          .string()
          .trim()
          .min(1, 'Enter an origin.')
          .max(ORIGIN_MAX, `Use at most ${ORIGIN_MAX} characters.`),
      })
    )
    .max(ORIGINS_MAX, `Use at most ${ORIGINS_MAX} origins.`)
    .superRefine((origins, ctx) => {
      const seen = new Set<string>()
      origins.forEach(({ value }, index) => {
        const v = normalizeOrigin(value)
        if (seen.has(v))
          ctx.addIssue({
            code: 'custom',
            message: 'This origin is already listed.',
            path: [index, 'value'],
          })
        seen.add(v)
      })
    }),
})
export type AppForm = z.infer<typeof appFormSchema>
export type AppUpdate = components['schemas']['AppUpdate']

// Add-permission form: the key is built as `<app>:<resource>:<action>`.
export const permissionFormSchema = z.object({
  resource: z
    .string()
    .trim()
    .min(1, 'Resource is required.')
    .regex(
      PERMISSION_SEGMENT_PATTERN,
      'Use 1–48 lowercase letters, digits and hyphens, starting with a letter.'
    ),
  action: z
    .string()
    .trim()
    .min(1, 'Action is required.')
    .regex(
      PERMISSION_SEGMENT_PATTERN,
      'Use 1–48 lowercase letters, digits and hyphens, starting with a letter.'
    ),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters.`),
  is_admin: z.boolean(),
})
export type PermissionForm = z.infer<typeof permissionFormSchema>

// Used only to validate the filter URL search params. Compile-time guards
// keep each zod enum equal to the generated type.
const appStatusSchema = z.enum(['active', 'disabled'])
const joinPolicySchema = z.enum(['open', 'approval', 'closed'])
const orgModeSchema = z.enum(['none', 'required'])
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const _enumsMatch: [
  Same<AppStatus, z.infer<typeof appStatusSchema>>,
  Same<JoinPolicy, z.infer<typeof joinPolicySchema>>,
  Same<OrgMode, z.infer<typeof orgModeSchema>>,
] = [true, true, true]
void _enumsMatch

// Every value of the API's AppCredentialScope; data.test.ts also checks it
// against openapi.json.
export const APP_CREDENTIAL_SCOPES = [
  'manifest',
  'releases',
  'org-members:read',
  'usage:read',
  'usage:write',
  'limits:write',
] as const
const _scopesMatch: Same<
  AppCredentialScope,
  (typeof APP_CREDENTIAL_SCOPES)[number]
> = true
void _scopesMatch

// API `sort` values (leading '-' = descending); the default is not kept in
// the URL.
type AppSort = NonNullable<
  NonNullable<paths['/api/v1/apps']['get']['parameters']['query']>['sort']
>
export const APP_SORTS = [
  'key',
  '-key',
  'name',
  '-name',
  'created_at',
  '-created_at',
] as const
export const APP_DEFAULT_SORT = 'key'
const _sortsMatch: Same<AppSort, (typeof APP_SORTS)[number]> = true
void _sortsMatch

// URL state of /apps. `q` is an app key or name, which is not PII, so it may
// sit in the URL (R5, ADR 0005 amendment). Unknown values fall back to the
// defaults.
export const appsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  q: searchTermSchema,
  status: appStatusSchema.optional().catch(undefined),
  join_policy: joinPolicySchema.optional().catch(undefined),
  org_mode: orgModeSchema.optional().catch(undefined),
  sort: z
    .enum(APP_SORTS)
    .optional()
    .catch(undefined)
    .transform((v) => (v === APP_DEFAULT_SORT ? undefined : v)),
})
