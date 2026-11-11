import { z } from 'zod'

// Mirrors the org-admin-api ADM-004 audit log entry (`GET /api/v1/audit-logs`).
// Replace with the generated OpenAPI type once ADM-004 ships (R2).

export const auditActions = [
  'user.disable',
  'user.enable',
  'organization.create',
  'organization.update',
  'organization.delete',
  'role.assign',
  'role.revoke',
  'app.update',
  'app.join',
  'auth.login.success',
  'auth.login.failure',
  'auth.logout',
] as const
export const auditActionSchema = z.enum(auditActions)
export type AuditAction = z.infer<typeof auditActionSchema>

export const auditTargetTypes = [
  'user',
  'organization',
  'app',
  'role',
  'session',
] as const
export const auditTargetTypeSchema = z.enum(auditTargetTypes)
export type AuditTargetType = z.infer<typeof auditTargetTypeSchema>

export const auditChangesSchema = z.object({
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
})
export type AuditChanges = z.infer<typeof auditChangesSchema>

export const auditLogEntrySchema = z.object({
  id: z.string(),
  occurred_at: z.iso.datetime(),
  /** null = anonymous or system actor */
  actor_user_id: z.string().nullable(),
  /** null = anonymous or system actor; masked for unknown-account login failures */
  actor_email: z.string().nullable(),
  action: auditActionSchema,
  target_type: auditTargetTypeSchema,
  target_id: z.string(),
  app_key: z.string().nullable(),
  org_id: z.string().nullable(),
  changes: auditChangesSchema.nullable(),
  ip: z.string(),
  user_agent: z.string(),
  request_id: z.string(),
})
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>
export const auditLogListSchema = z.array(auditLogEntrySchema)
