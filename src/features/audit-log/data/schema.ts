import { z } from 'zod'
import { type components } from '@/api'

// Generated from org-admin-api OpenAPI (R2); never hand-copy these shapes.
export type AuditLogEntry = components['schemas']['AuditLogRead']
export type AuditAction = components['schemas']['AuditAction']
export type AuditTarget = components['schemas']['AuditTarget']
export type ActorKind = components['schemas']['ActorKind']
export type AuditOutcome = components['schemas']['AuditOutcome']

// Used only to validate URL search params. The compile-time guards keep each
// zod enum equal to the generated type.
export const auditActionSchema = z.enum([
  'organization.created',
  'organization.updated',
  'organization.deleted',
  'organization.invitation_created',
  'organization.invitation_accepted',
  'organization.invitation_revoked',
  'user.created',
  'user.disabled',
  'user.enabled',
  'user.session_revoked',
  'user.sessions_revoked',
  'app.created',
  'app.updated',
  'app.deleted',
  'app.registered',
  'app.admin_origins_set',
  'app.joined',
  'app.join_requested',
  'app.join_request_approved',
  'app.join_request_rejected',
  'app_credential.issued',
  'app_credential.revoked',
  'app.manifest_synced',
  'entitlement.granted',
  'entitlement.updated',
  'entitlement.revoked',
  'permission.created',
  'permission.updated',
  'permission.deleted',
  'role.created',
  'role.updated',
  'role.deleted',
  'role.permissions_replaced',
  'role_assignment.granted',
  'role_assignment.revoked',
  'email_retention.purged',
  'audit_log.purged',
  'auth.login_succeeded',
  'auth.login_failed',
  'auth.logged_out',
  'auth.logged_out_all',
  'device_session.reuse_revoked',
  'auth.password_reset_completed',
  'auth.email_verified',
])
export const auditTargetSchema = z.enum([
  'organization',
  'user',
  'app',
  'permission',
  'role',
  'role_assignment',
  'device_session',
  'invitation',
  'app_credential',
  'join_request',
  'entitlement',
])
export const actorKindSchema = z.enum(['user', 'system', 'anonymous'])
export const auditOutcomeSchema = z.enum(['success', 'failure', 'denied'])

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const _guards: [
  Same<AuditAction, z.infer<typeof auditActionSchema>>,
  Same<AuditTarget, z.infer<typeof auditTargetSchema>>,
  Same<ActorKind, z.infer<typeof actorKindSchema>>,
  Same<AuditOutcome, z.infer<typeof auditOutcomeSchema>>,
] = [true, true, true, true]
void _guards
