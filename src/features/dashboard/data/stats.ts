// Mock until org-admin-api offers dashboard stats (gap, not ticketed yet).
// Counts follow org-admin-api names: users (USR-01), organizations (ADM-001),
// apps / role assignments (USR-02), audit events (ADM-004).

export type Kpi = {
  key: 'users' | 'organizations' | 'apps' | 'sign_ins_24h'
  label: string
  value: number
  change_pct: number
  period: string
}

export const kpis: Kpi[] = [
  {
    key: 'users',
    label: 'Users',
    value: 1284,
    change_pct: 8.2,
    period: 'vs last month',
  },
  {
    key: 'organizations',
    label: 'Active organizations',
    value: 57,
    change_pct: 3.6,
    period: 'vs last month',
  },
  {
    key: 'apps',
    label: 'Registered apps',
    value: 8,
    change_pct: 0,
    period: 'no change',
  },
  {
    key: 'sign_ins_24h',
    label: 'Sign-ins (24 h)',
    value: 342,
    change_pct: -4.1,
    period: 'vs previous 24 h',
  },
]

export type MonthlySignups = { month: string; signups: number }

export const monthlySignups: MonthlySignups[] = [
  { month: 'Dec', signups: 41 },
  { month: 'Jan', signups: 58 },
  { month: 'Feb', signups: 63 },
  { month: 'Mar', signups: 77 },
  { month: 'Apr', signups: 70 },
  { month: 'May', signups: 92 },
  { month: 'Jun', signups: 104 },
  { month: 'Jul', signups: 98 },
  { month: 'Aug', signups: 121 },
  { month: 'Sep', signups: 133 },
  { month: 'Oct', signups: 149 },
  { month: 'Nov', signups: 118 },
]

export type DailySignIns = { day: string; success: number; failure: number }

export const dailySignIns: DailySignIns[] = [
  { day: 'Mon', success: 312, failure: 14 },
  { day: 'Tue', success: 356, failure: 9 },
  { day: 'Wed', success: 341, failure: 22 },
  { day: 'Thu', success: 368, failure: 11 },
  { day: 'Fri', success: 330, failure: 17 },
  { day: 'Sat', success: 184, failure: 6 },
  { day: 'Sun', success: 201, failure: 8 },
]

export type AppMembers = { app_key: string; members: number }

export const membersByApp: AppMembers[] = [
  { app_key: 'stoktok', members: 412 },
  { app_key: 'calechip', members: 368 },
  { app_key: 'tudocuatui', members: 251 },
  { app_key: 'ricotdin', members: 187 },
  { app_key: 'surveyai', members: 143 },
  { app_key: 'spacem', members: 96 },
  { app_key: 'seatmgt', members: 61 },
  { app_key: 'admin', members: 7 },
]

export type RecentEvent = {
  id: string
  occurred_at: string
  actor_email: string | null
  action: string
  target: string
}

export const recentEvents: RecentEvent[] = [
  {
    id: 'e1',
    occurred_at: '2026-11-11T08:42:00Z',
    actor_email: 'linh@mmlabs.online',
    action: 'user.disable',
    target: 'user · hoang.tran@example.com',
  },
  {
    id: 'e2',
    occurred_at: '2026-11-11T08:15:00Z',
    actor_email: 'minh@mmlabs.online',
    action: 'role.assign',
    target: 'role · calechip:org-owner',
  },
  {
    id: 'e3',
    occurred_at: '2026-11-11T07:58:00Z',
    actor_email: null,
    action: 'auth.login.failure',
    target: 'session · a***@example.com',
  },
  {
    id: 'e4',
    occurred_at: '2026-11-11T07:30:00Z',
    actor_email: 'minh@mmlabs.online',
    action: 'organization.create',
    target: 'organization · green-farm',
  },
  {
    id: 'e5',
    occurred_at: '2026-11-11T06:47:00Z',
    actor_email: 'an@mmlabs.online',
    action: 'app.update',
    target: 'app · stoktok',
  },
]

export type AttentionItem = {
  id: string
  label: string
  count: number
  to: '/users' | '/organizations' | '/audit-log'
}

export const attentionItems: AttentionItem[] = [
  {
    id: 'unverified',
    label: 'Users with unverified email',
    count: 38,
    to: '/users',
  },
  {
    id: 'suspended',
    label: 'Suspended organizations',
    count: 4,
    to: '/organizations',
  },
  {
    id: 'failed-logins',
    label: 'Failed sign-ins in the last 24 h',
    count: 17,
    to: '/audit-log',
  },
]
