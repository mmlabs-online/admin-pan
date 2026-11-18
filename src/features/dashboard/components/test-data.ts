import { type DashboardStats } from '../api/queries'

// Every number is distinct so a swapped mapping fails a test.
export const STATS: DashboardStats = {
  generated_at: '2026-11-18T03:00:00Z',
  users: {
    total: 1284,
    by_status: { active: 1200, disabled: 84 },
    unverified: 37,
  },
  organizations: { total: 61, by_status: { active: 57, suspended: 4 } },
  apps: { total: 9, by_status: { active: 8, disabled: 1 } },
  sign_ins_24h: {
    window_start: '2026-11-17T03:00:00Z',
    window_end: '2026-11-18T03:00:00Z',
    succeeded: 342,
    failed: 19,
  },
  sign_ups: {
    time_zone: 'Etc/UTC',
    by_month: [
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ].map((month, i) => ({ month, count: 100 + i * 7 })),
  },
  members_per_app: [
    { app_key: 'admin', name: 'Admin', member_count: 5 },
    { app_key: 'stoktok', name: 'Stoktok', member_count: 21 },
    { app_key: 'legacy', name: 'Legacy app', member_count: 3 },
  ],
}

export function zeroStats(): DashboardStats {
  return {
    generated_at: STATS.generated_at,
    users: { total: 0, by_status: { active: 0, disabled: 0 }, unverified: 0 },
    organizations: { total: 0, by_status: { active: 0, suspended: 0 } },
    apps: { total: 0, by_status: { active: 0, disabled: 0 } },
    sign_ins_24h: { ...STATS.sign_ins_24h, succeeded: 0, failed: 0 },
    sign_ups: {
      time_zone: STATS.sign_ups.time_zone,
      by_month: STATS.sign_ups.by_month.map((m) => ({ ...m, count: 0 })),
    },
    members_per_app: STATS.members_per_app.map((a) => ({
      ...a,
      member_count: 0,
    })),
  }
}

export const withStats = (over: Partial<DashboardStats>): DashboardStats => ({
  ...STATS,
  ...over,
})
