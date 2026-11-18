import { z } from 'zod'
import { type components } from '@/api'

// Generated from org-admin-api OpenAPI (R2); never hand-copy these shapes.
export type App = components['schemas']['AppRead']
export type AppStatus = components['schemas']['AppStatus']
export type JoinPolicy = components['schemas']['JoinPolicy']
export type OrgMode = components['schemas']['OrgMode']
export type Permission = components['schemas']['PermissionRead']
export type PermissionScope = components['schemas']['PermissionScope']
export type AppCredential = components['schemas']['AppCredentialRead']
export type JoinRequest = components['schemas']['JoinRequestRead']

export const ADMIN_APP_KEY = 'admin'

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

// URL state of /apps: paging only. The API has no status/join_policy/q/sort
// on the list, so old ?filter= and ?join_policy= keys are dropped.
export const appsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
})
