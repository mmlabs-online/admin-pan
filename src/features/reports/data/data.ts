import {
  type ReportFormat,
  type ReportSchedule,
  type ReportStatus,
  type ReportType,
} from './schema'

export const reportTypes: { label: string; value: ReportType }[] = [
  { label: 'User sign-ups', value: 'user_signups' },
  { label: 'Active users', value: 'active_users' },
  { label: 'App memberships', value: 'app_memberships' },
  { label: 'Organization overview', value: 'org_overview' },
  { label: 'Audit activity', value: 'audit_activity' },
]

export const reportStatuses: { label: string; value: ReportStatus }[] = [
  { label: 'Ready', value: 'ready' },
  { label: 'Running', value: 'running' },
  { label: 'Failed', value: 'failed' },
  { label: 'Scheduled', value: 'scheduled' },
]

export const reportSchedules: { label: string; value: ReportSchedule }[] = [
  { label: 'None (on demand)', value: 'none' },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
]

export const reportFormats: { label: string; value: ReportFormat }[] = [
  { label: 'CSV', value: 'csv' },
  { label: 'Excel (XLSX)', value: 'xlsx' },
]

/** Mock app keys; real ones come from org-admin-api `GET /apps`. */
export const appKeys = ['admin', 'stoktok', 'calechip', 'tudocuatui'] as const

export const statusBadgeClass = new Map<ReportStatus, string>([
  ['ready', 'border-teal-200 bg-teal-100/30 text-teal-900 dark:text-teal-200'],
  ['running', 'border-sky-300 bg-sky-200/40 text-sky-900 dark:text-sky-100'],
  [
    'failed',
    'border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/20',
  ],
  ['scheduled', 'border-neutral-300 bg-neutral-300/40 text-foreground'],
])

export const typeLabel = (type: ReportType) =>
  reportTypes.find((t) => t.value === type)?.label ?? type

export const scheduleLabel = (schedule: ReportSchedule) =>
  schedule === 'none'
    ? 'On demand'
    : (reportSchedules.find((s) => s.value === schedule)?.label ?? schedule)

export const statusLabel = (status: ReportStatus) =>
  reportStatuses.find((s) => s.value === status)?.label ?? status
