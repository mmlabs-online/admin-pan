import { z } from 'zod'
import { auditAppKeys } from './data'
import { auditActionSchema, auditTargetTypeSchema } from './schema'

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined)

/** URL search state for `/audit-log` (mirrors the ADM-004 list filters). */
export const auditLogSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  actor: z.string().optional().catch(''),
  action: z.array(auditActionSchema).optional().catch([]),
  targetType: z.array(auditTargetTypeSchema).optional().catch([]),
  app: z.array(z.enum(auditAppKeys)).optional().catch([]),
  from: day,
  to: day,
})
export type AuditLogSearch = z.infer<typeof auditLogSearchSchema>
