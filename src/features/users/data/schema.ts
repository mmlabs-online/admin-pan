import { z } from 'zod'
import { type components } from '@/api'

// Generated from org-admin-api OpenAPI (R2); never hand-copy these shapes.
export type User = components['schemas']['UserRead']
export type UserStatus = components['schemas']['UserStatus']
export type UserSession = components['schemas']['UserSessionRead']

// Used only to validate the `status` URL search param.
export const userStatusSchema = z.enum(['active', 'disabled'])
// Compile-time guard: the zod enum must stay equal to the generated type.
const _statusMatches: [UserStatus] extends [z.infer<typeof userStatusSchema>]
  ? [z.infer<typeof userStatusSchema>] extends [UserStatus]
    ? true
    : never
  : never = true
void _statusMatches

// URL state of /users. The typed email filter is deliberately absent: it stays
// in component state so no email ends up in the URL (R5, ADR 0005).
export const usersSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  status: z.array(userStatusSchema).optional().catch([]),
})
