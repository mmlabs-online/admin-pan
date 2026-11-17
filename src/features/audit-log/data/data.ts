import {
  type ActorKind,
  type AuditAction,
  type AuditOutcome,
  type AuditTarget,
} from './schema'

/** org-admin-api `app_key` pattern (rbac/models.py:33). */
export const APP_KEY_PATTERN = /^[a-z][a-z0-9-]{1,31}$/

type Tone = 'neutral' | 'success' | 'danger' | 'info' | 'warning'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-neutral-300/40 border-neutral-300',
  success:
    'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200 dark:border-teal-800',
  danger:
    'bg-destructive/10 dark:bg-destructive/50 text-red-800 dark:text-primary border-destructive/10',
  info: 'bg-sky-200/40 text-sky-900 dark:text-sky-100 border-sky-300 dark:border-sky-800',
  warning:
    'bg-amber-100/40 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-800',
}

// Typed Records: TypeScript fails when the API adds an enum value.
const actionTones: Record<AuditAction, Tone> = {
  'organization.created': 'success',
  'organization.updated': 'info',
  'organization.deleted': 'danger',
  'organization.invitation_created': 'info',
  'organization.invitation_accepted': 'success',
  'organization.invitation_revoked': 'warning',
  'user.created': 'success',
  'user.disabled': 'danger',
  'user.enabled': 'success',
  'app.created': 'success',
  'app.updated': 'info',
  'app.deleted': 'danger',
  'app.registered': 'success',
  'app.admin_origins_set': 'info',
  'app.joined': 'success',
  'permission.created': 'success',
  'permission.updated': 'info',
  'permission.deleted': 'danger',
  'role.created': 'success',
  'role.updated': 'info',
  'role.deleted': 'danger',
  'role.permissions_replaced': 'info',
  'role_assignment.granted': 'info',
  'role_assignment.revoked': 'warning',
  'email_retention.purged': 'warning',
  'audit_log.purged': 'warning',
  'auth.login_succeeded': 'neutral',
  'auth.login_failed': 'warning',
  'auth.logged_out': 'neutral',
  'auth.logged_out_all': 'neutral',
  'device_session.reuse_revoked': 'danger',
  'auth.password_reset_completed': 'info',
  'auth.email_verified': 'success',
}

const outcomeTones: Record<AuditOutcome, Tone> = {
  success: 'success',
  failure: 'warning',
  denied: 'danger',
}

const isAction = (a: string): a is AuditAction => a in actionTones

/** Responses carry plain strings, so unknown values fall back to neutral. */
export function actionBadgeClass(action: string): string {
  return toneClasses[isAction(action) ? actionTones[action] : 'neutral']
}

export function outcomeBadgeClass(outcome: AuditOutcome): string {
  return toneClasses[outcomeTones[outcome]]
}

export const targetLabels: Record<AuditTarget, string> = {
  organization: 'Organization',
  user: 'User',
  app: 'App',
  permission: 'Permission',
  role: 'Role',
  role_assignment: 'Role assignment',
  device_session: 'Device session',
  invitation: 'Invitation',
}

export const actorKindLabels: Record<ActorKind, string> = {
  user: 'User',
  system: 'System',
  anonymous: 'Anonymous',
}

export const outcomeLabels: Record<AuditOutcome, string> = {
  success: 'Success',
  failure: 'Failure',
  denied: 'Denied',
}

const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ label: labels[value], value }))

export const actionOptions = (Object.keys(actionTones) as AuditAction[]).map(
  (value) => ({ label: value, value })
)
export const targetTypeOptions = toOptions(targetLabels)
export const actorKindOptions = toOptions(actorKindLabels)
export const outcomeOptions = toOptions(outcomeLabels)
