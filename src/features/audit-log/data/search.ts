import { z } from 'zod'
import { APP_KEY_PATTERN } from './data'
import {
  actorKindSchema,
  auditActionSchema,
  auditOutcomeSchema,
  auditTargetSchema,
} from './schema'

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined)

/**
 * URL search state for `/audit-log` (the `GET /api/v1/audit-logs` filters). Only
 * enums, an app key, uuids and days: no free text, no email (R5, ADR 0005).
 */
export const auditLogSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  action: auditActionSchema.optional().catch(undefined),
  targetType: auditTargetSchema.optional().catch(undefined),
  actorKind: actorKindSchema.optional().catch(undefined),
  outcome: auditOutcomeSchema.optional().catch(undefined),
  app: z.string().regex(APP_KEY_PATTERN).optional().catch(undefined),
  actor: z.guid().optional().catch(undefined),
  target: z.guid().optional().catch(undefined),
  from: day,
  to: day,
})
export type AuditLogSearch = z.infer<typeof auditLogSearchSchema>
