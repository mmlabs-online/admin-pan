import { format } from 'date-fns'
import { type AuditLogEntry } from '../data/schema'

/** First 8 characters of an id, for compact table cells. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
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

export function formatTimestamp(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd HH:mm:ss')
}

/**
 * Picked local days -> API `from` / `to`. `from` is the start of the first day
 * (inclusive); `to` is the start of the day after the last day, because the
 * API's `to` is exclusive. `Date` handles DST.
 */
export function toAuditRange(
  fromDay?: string,
  toDay?: string
): { from?: string; to?: string } {
  const from = parseDay(fromDay)
  const to = parseDay(toDay)
  return {
    ...(from ? { from: from.toISOString() } : {}),
    ...(to
      ? {
          to: new Date(
            to.getFullYear(),
            to.getMonth(),
            to.getDate() + 1
          ).toISOString(),
        }
      : {}),
  }
}

/** True when both days are set and `from` is after `to`. */
export function isRangeInverted(fromDay?: string, toDay?: string): boolean {
  const from = parseDay(fromDay)
  const to = parseDay(toDay)
  return !!from && !!to && from.getTime() > to.getTime()
}

/** e.g. `Asia/Ho_Chi_Minh (UTC+07:00)`. */
export function localZoneLabel(date: Date = new Date()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = -date.getTimezoneOffset()
  const abs = Math.abs(offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  const sign = offset < 0 ? '-' : '+'
  return `${zone} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`
}

/** Actor column text: user -> short id, system -> label, anonymous. */
export function actorDisplay(
  entry: Pick<AuditLogEntry, 'actor_kind' | 'actor_user_id' | 'actor_label'>
): string {
  switch (entry.actor_kind) {
    case 'user':
      return entry.actor_user_id ? shortId(entry.actor_user_id) : 'User'
    case 'system':
      return entry.actor_label ?? 'System'
    case 'anonymous':
      return 'Anonymous'
    default:
      return entry.actor_kind
  }
}

const MAX_VALUE_LENGTH = 500

/** JSON text of a value, capped; React renders it as a text node (R6). */
export function formatValue(value: unknown): string {
  const text = JSON.stringify(value) ?? 'undefined'
  return text.length > MAX_VALUE_LENGTH
    ? `${text.slice(0, MAX_VALUE_LENGTH)}…`
    : text
}

export type ChangeRows = {
  /** Entries shaped exactly `{from, to}`. */
  diff: { field: string; from: unknown; to: unknown }[]
  /** Every other entry. */
  values: { field: string; value: unknown }[]
}

function isFromTo(v: unknown): v is { from: unknown; to: unknown } {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const keys = Object.keys(v)
  return keys.length === 2 && 'from' in v && 'to' in v
}

/** Splits the free-form `changes` map into before/after rows and plain values. */
export function describeChanges(changes: unknown): ChangeRows {
  const rows: ChangeRows = { diff: [], values: [] }
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes))
    return rows
  for (const [field, value] of Object.entries(changes)) {
    if (isFromTo(value))
      rows.diff.push({ field, from: value.from, to: value.to })
    else rows.values.push({ field, value })
  }
  return rows
}
