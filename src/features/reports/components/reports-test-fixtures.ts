import { type Report } from '../data/schema'

/** Test-only report factory. */
export const makeReport = (overrides: Partial<Report>): Report => ({
  id: 'rep-x',
  name: 'Report',
  type: 'user_signups',
  params: { date_from: '2026-10-01', date_to: '2026-10-31' },
  format: 'csv',
  schedule: 'none',
  status: 'ready',
  last_run_at: '2026-11-01T09:00:00.000Z',
  row_count: 120,
  created_by: 'ops@mmlabs.online',
  created_at: '2026-09-01T09:00:00.000Z',
  ...overrides,
})
