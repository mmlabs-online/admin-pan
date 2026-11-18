import { type DashboardStats } from '../api/queries'
import { formatCount, formatMonth } from '../lib/format'

export type Kpi = {
  key: 'users' | 'organizations' | 'apps' | 'sign_ins_24h'
  label: string
  value: number
  detail: string
}

export type SignupRow = {
  month: string
  label: string
  tick: string
  count: number
  partial: boolean
}

export type AttentionItem = {
  id: string
  label: string
  count: number
  to?: '/audit-log'
  search?: { action: 'auth.login_failed' }
}

const n = formatCount

/** Every number is a field the API sends; nothing is computed here (R1). */
export function toKpis(s: DashboardStats): Kpi[] {
  return [
    {
      key: 'users',
      label: 'Users',
      value: s.users.total,
      detail: `${n(s.users.by_status.active)} active · ${n(s.users.by_status.disabled)} disabled`,
    },
    {
      key: 'organizations',
      label: 'Active organizations',
      value: s.organizations.by_status.active,
      detail: `${n(s.organizations.by_status.suspended)} suspended · ${n(s.organizations.total)} total`,
    },
    {
      key: 'apps',
      label: 'Registered apps',
      value: s.apps.total,
      detail: `${n(s.apps.by_status.active)} active · ${n(s.apps.by_status.disabled)} disabled`,
    },
    {
      key: 'sign_ins_24h',
      label: 'Sign-ins (24 h)',
      value: s.sign_ins_24h.succeeded,
      detail: `${n(s.sign_ins_24h.failed)} failed`,
    },
  ]
}

/** API order is kept; the API documents the last month as the current one. */
export function toSignupRows(s: DashboardStats): SignupRow[] {
  const rows = s.sign_ups.by_month
  return rows.map(({ month, count }, i) => {
    const partial = i === rows.length - 1
    return {
      month,
      label: formatMonth(month, 'full') + (partial ? ' (partial)' : ''),
      tick: formatMonth(month, 'tick'),
      count,
      partial,
    }
  })
}

export function toAttentionItems(s: DashboardStats): AttentionItem[] {
  return [
    {
      id: 'unverified',
      label: 'Users with unverified email (includes disabled users)',
      count: s.users.unverified,
    },
    {
      id: 'suspended',
      label: 'Suspended organizations',
      count: s.organizations.by_status.suspended,
    },
    {
      id: 'failed-sign-ins',
      label: 'Failed sign-ins (last 24 h)',
      count: s.sign_ins_24h.failed,
      to: '/audit-log',
      search: { action: 'auth.login_failed' },
    },
  ]
}
