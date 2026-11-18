import { z } from 'zod'
import { type components, type paths } from '@/api'
import { searchTermSchema } from '@/lib/list-search'

// Generated from org-admin-api OpenAPI (R2); never hand-copy these shapes.
export type Organization = components['schemas']['OrganizationRead']
export type OrganizationStatus = components['schemas']['OrganizationStatus']

// Limits of `OrganizationCreate` (openapi.json); schema.test.ts guards drift.
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
export const SLUG_MAX = 63
export const NAME_MAX = 255
export const DESCRIPTION_MAX = 5000

// Create/edit form. Slug is only sent on create (PATCH accepts name,
// description and status); description '' is sent as null. The API does not
// trim, so a whitespace-only name is stopped here.
export const organizationFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(SLUG_MAX, `Use at most ${SLUG_MAX} characters.`)
    .regex(
      SLUG_PATTERN,
      'Use lowercase letters, digits and hyphens; start and end with a letter or digit.'
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(NAME_MAX, `Use at most ${NAME_MAX} characters.`),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters.`),
})
export type OrganizationForm = z.infer<typeof organizationFormSchema>

// Used only to validate the `status` URL search param.
export const organizationStatusSchema = z.enum(['active', 'suspended'])
// Compile-time guard: the zod enum must stay equal to the generated type.
const _statusMatches: [OrganizationStatus] extends [
  z.infer<typeof organizationStatusSchema>,
]
  ? [z.infer<typeof organizationStatusSchema>] extends [OrganizationStatus]
    ? true
    : never
  : never = true
void _statusMatches

// API `sort` values (leading '-' = descending); the default is not kept in
// the URL.
type OrgSort = NonNullable<
  NonNullable<
    paths['/api/v1/organizations']['get']['parameters']['query']
  >['sort']
>
export const ORG_SORTS = [
  'created_at',
  '-created_at',
  'name',
  '-name',
  'slug',
  '-slug',
] as const
export const ORG_DEFAULT_SORT = '-created_at'
const _sortsMatch: [OrgSort] extends [(typeof ORG_SORTS)[number]]
  ? [(typeof ORG_SORTS)[number]] extends [OrgSort]
    ? true
    : never
  : never = true
void _sortsMatch

// URL state of /organizations. `q` is an org name or slug, which is not PII,
// so it may sit in the URL (R5, ADR 0005 amendment). Unknown values fall back
// to the defaults.
export const organizationsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  q: searchTermSchema,
  status: organizationStatusSchema.optional().catch(undefined),
  sort: z
    .enum(ORG_SORTS)
    .optional()
    .catch(undefined)
    .transform((v) => (v === ORG_DEFAULT_SORT ? undefined : v)),
})
