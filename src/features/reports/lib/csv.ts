import { type Report } from '../data/schema'

export type CsvValue = string | number | null | undefined
export type CsvRow = Record<string, CsvValue>

// Cells starting with these characters can be interpreted as formulas by
// spreadsheet apps (CSV injection); prefix them with a single quote.
const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) {
    text = `'${text}`
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** Builds an RFC 4180 CSV string (CRLF line endings) from rows. */
export function buildCsv(columns: string[], rows: CsvRow[]): string {
  const lines = [
    columns.map(escapeCsvCell).join(','),
    ...rows.map((row) => columns.map((c) => escapeCsvCell(row[c])).join(',')),
  ]
  return `${lines.join('\r\n')}\r\n`
}

/** Small deterministic PRNG (mulberry32) so a report always yields the same mock rows. */
function prng(seedText: string) {
  let seed = 0
  for (let i = 0; i < seedText.length; i++) {
    seed = (Math.imul(31, seed) + seedText.charCodeAt(i)) | 0
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MOCK_APPS = ['admin', 'stoktok', 'calechip', 'tudocuatui']
const MOCK_ACTIONS = [
  'user.invite',
  'user.suspend',
  'role.grant',
  'role.revoke',
  'org.update',
]

/** Mock result rows for a report (max 20); replaced by the API's export later. */
export function buildReportRows(report: Report): {
  columns: string[]
  rows: CsvRow[]
} {
  const rand = prng(`${report.id}:${report.last_run_at ?? ''}`)
  const int = (min: number, max: number) =>
    Math.floor(rand() * (max - min + 1)) + min
  const count = Math.min(report.row_count ?? 10, 20)
  const apps = report.params.app_key ? [report.params.app_key] : MOCK_APPS
  const from = new Date(`${report.params.date_from}T00:00:00Z`)
  const day = (i: number) => {
    const d = new Date(from)
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  }
  const pick = <T>(list: readonly T[]) => list[int(0, list.length - 1)]

  switch (report.type) {
    case 'user_signups':
      return {
        columns: ['date', 'app_key', 'signups'],
        rows: Array.from({ length: count }, (_, i) => ({
          date: day(i),
          app_key: pick(apps),
          signups: int(0, 120),
        })),
      }
    case 'active_users':
      return {
        columns: ['date', 'app_key', 'active_users'],
        rows: Array.from({ length: count }, (_, i) => ({
          date: day(i),
          app_key: pick(apps),
          active_users: int(50, 3000),
        })),
      }
    case 'app_memberships':
      return {
        columns: ['app_key', 'org_id', 'members'],
        rows: Array.from({ length: count }, (_, i) => ({
          app_key: pick(apps),
          org_id: `org_${1000 + i}`,
          members: int(1, 400),
        })),
      }
    case 'org_overview':
      return {
        columns: ['org_id', 'members', 'apps', 'created_on'],
        rows: Array.from({ length: count }, (_, i) => ({
          org_id: `org_${1000 + i}`,
          members: int(1, 400),
          apps: int(1, MOCK_APPS.length),
          created_on: day(-int(0, 365)),
        })),
      }
    case 'audit_activity':
      return {
        columns: ['occurred_at', 'actor_id', 'action', 'target_id'],
        rows: Array.from({ length: count }, (_, i) => ({
          occurred_at: `${day(i)}T${String(int(0, 23)).padStart(2, '0')}:00:00Z`,
          actor_id: `usr_${int(100, 999)}`,
          action: pick(MOCK_ACTIONS),
          target_id: `usr_${int(100, 999)}`,
        })),
      }
  }
}

/** Only a finished run has an output to download. */
export const canDownload = (report: Report) =>
  report.status === 'ready' && report.last_run_at !== null

/** File-name safe slug of the report name, e.g. `user-signups-q4.csv`. */
export function reportFileName(report: Report): string {
  const slug =
    report.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'report'
  return `${slug}.csv`
}

/** Triggers a browser download of `content` as a CSV file. */
export function downloadCsv(fileName: string, content: string) {
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(['﻿', content], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
