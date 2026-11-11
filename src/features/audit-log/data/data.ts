import { type AuditAction, type AuditTargetType } from './schema'

/** App keys known to the mock data (later: org-admin-api apps registry). */
export const auditAppKeys = ['admin', 'stoktok', 'identity'] as const

type Tone = 'neutral' | 'success' | 'danger' | 'info' | 'warning'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-neutral-300/40 border-neutral-300',
  success:
    'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200 dark:border-teal-800',
  danger:
    'bg-destructive/10 dark:bg-destructive/50 text-destructive dark:text-primary border-destructive/10',
  info: 'bg-sky-200/40 text-sky-900 dark:text-sky-100 border-sky-300 dark:border-sky-800',
  warning:
    'bg-amber-100/40 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-800',
}

const actionTones: Record<AuditAction, Tone> = {
  'user.disable': 'danger',
  'user.enable': 'success',
  'organization.create': 'success',
  'organization.update': 'info',
  'organization.delete': 'danger',
  'role.assign': 'info',
  'role.revoke': 'warning',
  'app.update': 'info',
  'app.join': 'success',
  'auth.login.success': 'neutral',
  'auth.login.failure': 'warning',
  'auth.logout': 'neutral',
}

export function actionBadgeClass(action: AuditAction): string {
  return toneClasses[actionTones[action]]
}

export const actionOptions: { label: string; value: AuditAction }[] = (
  Object.keys(actionTones) as AuditAction[]
).map((value) => ({ label: value, value }))

export const targetTypeOptions: { label: string; value: AuditTargetType }[] = [
  { label: 'User', value: 'user' },
  { label: 'Organization', value: 'organization' },
  { label: 'App', value: 'app' },
  { label: 'Role', value: 'role' },
  { label: 'Session', value: 'session' },
]

export const appOptions = auditAppKeys.map((value) => ({
  label: value,
  value,
}))
