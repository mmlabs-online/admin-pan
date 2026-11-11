import { type AuditChanges, type AuditLogEntry } from '../data/schema'

/** Masks the local part of an email: `alice@example.com` → `a***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***${email.slice(at)}`
}

/** First 8 characters of an id, for compact table cells. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

/** Display label for the actor; `null` email means system/anonymous. */
export function actorLabel(
  entry: Pick<AuditLogEntry, 'actor_email' | 'actor_user_id'>
): string {
  if (entry.actor_email) return entry.actor_email
  return entry.actor_user_id ? entry.actor_user_id : 'System'
}

/** Case-insensitive actor match against email, user id and the "System" label. */
export function matchesActor(entry: AuditLogEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [actorLabel(entry), entry.actor_user_id ?? ''].some((v) =>
    v.toLowerCase().includes(q)
  )
}

/** Parses `yyyy-MM-dd` as a local calendar date (no timezone shift). */
export function parseDay(day: string | undefined): Date | undefined {
  if (!day) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return undefined
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Formats a date as local `yyyy-MM-dd` (URL search value). */
export function formatDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Keeps entries whose `occurred_at` falls within [from 00:00, to 23:59:59.999] local time. */
export function filterByDateRange<T extends Pick<AuditLogEntry, 'occurred_at'>>(
  entries: T[],
  from?: string,
  to?: string
): T[] {
  const fromDate = parseDay(from)
  const toDate = parseDay(to)
  if (!fromDate && !toDate) return entries
  const start = fromDate?.getTime() ?? -Infinity
  const end = toDate
    ? new Date(
        toDate.getFullYear(),
        toDate.getMonth(),
        toDate.getDate() + 1
      ).getTime() - 1
    : Infinity
  return entries.filter((e) => {
    const t = new Date(e.occurred_at).getTime()
    return t >= start && t <= end
  })
}

export type DiffLine = {
  kind: 'added' | 'removed' | 'unchanged'
  text: string
}

function stringify(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined'
}

/**
 * Line diff of the top-level keys of `changes.before` / `changes.after`.
 * Values are rendered as compact JSON text (never HTML).
 */
export function diffChanges(changes: AuditChanges | null): DiffLine[] {
  if (!changes) return []
  const before = changes.before ?? {}
  const after = changes.after ?? {}
  const keys = [...Object.keys(before)]
  for (const key of Object.keys(after)) if (!(key in before)) keys.push(key)

  const lines: DiffLine[] = []
  for (const key of keys) {
    const inBefore = key in before
    const inAfter = key in after
    const oldText = inBefore ? stringify(before[key]) : ''
    const newText = inAfter ? stringify(after[key]) : ''
    if (inBefore && inAfter && oldText === newText) {
      lines.push({ kind: 'unchanged', text: `  ${key}: ${oldText}` })
      continue
    }
    if (inBefore) lines.push({ kind: 'removed', text: `- ${key}: ${oldText}` })
    if (inAfter) lines.push({ kind: 'added', text: `+ ${key}: ${newText}` })
  }
  return lines
}

/** Pretty JSON for a before/after block, or a placeholder when absent. */
export function formatJson(value: unknown): string {
  return value === undefined || value === null
    ? '—'
    : JSON.stringify(value, null, 2)
}

const csvColumns = [
  'id',
  'occurred_at',
  'actor_user_id',
  'actor_email',
  'action',
  'target_type',
  'target_id',
  'app_key',
  'org_id',
  'ip',
  'user_agent',
  'request_id',
  'changes',
] as const satisfies readonly (keyof AuditLogEntry)[]

function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value)
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Serialises entries to RFC 4180 CSV (header row + one row per entry). */
export function toCsv(entries: AuditLogEntry[]): string {
  const rows = [csvColumns.join(',')]
  for (const entry of entries) {
    rows.push(csvColumns.map((col) => csvCell(entry[col])).join(','))
  }
  return rows.join('\r\n')
}
