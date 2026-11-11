import { z } from 'zod'

// Mirrors org-admin-api `OrganizationRead` (ADM-001; `created_by` added by USR-06).
// Replaced by the generated OpenAPI types once the API client lands.
export const organizationStatusSchema = z.enum(['active', 'suspended'])
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>

export const organizationSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: organizationStatusSchema,
  created_by: z.uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Organization = z.infer<typeof organizationSchema>

// Slug rule from org-admin-api: lowercase letters, digits and hyphens.
export const SLUG_PATTERN = /^[a-z0-9-]+$/

// Create/edit form. Slug is only sent on create (PATCH accepts name,
// description and status); description '' is sent as null.
export const organizationFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .regex(SLUG_PATTERN, 'Use only lowercase letters, digits and hyphens.'),
  name: z.string().trim().min(1, 'Name is required.'),
  description: z.string().trim(),
})
export type OrganizationForm = z.infer<typeof organizationFormSchema>
