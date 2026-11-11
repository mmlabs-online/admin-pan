import { z } from 'zod'

// Mirrors org-admin-api `UserRead` (GET /api/v1/users, USR-01b).
export const userStatusSchema = z.enum(['active', 'disabled'])
export type UserStatus = z.infer<typeof userStatusSchema>

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  display_name: z.string().nullable(),
  status: userStatusSchema,
  email_verified_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
})
export type User = z.infer<typeof userSchema>

export const userListSchema = z.array(userSchema)
