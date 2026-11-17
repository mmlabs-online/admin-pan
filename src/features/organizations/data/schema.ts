import { z } from 'zod'
import { type components } from '@/api'

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

// URL state of /organizations: paging only. The API has no status/q/sort on
// the list, so old ?filter= and ?status= keys are dropped.
export const organizationsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
})
