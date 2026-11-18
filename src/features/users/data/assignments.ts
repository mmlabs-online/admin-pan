import { type components } from '@/api'

// Generated from org-admin-api OpenAPI (R2); never hand-copy these shapes.
export type Assignment = components['schemas']['AssignmentRead']
export type AssignmentCreate = components['schemas']['AssignmentCreate']
export type RoleHolder = components['schemas']['RoleHolderRead']

// Production access tokens last 12 h (org-admin-api ADR-0005, USR-13 amendment
// 2026-11-17). App roles are copied into app tokens when minted (ADR-0001);
// admin permissions are read on every request. Pinned by assignments.test.ts.
export const APP_TOKEN_MAX_HOURS = 12

/** When a grant or revoke takes effect. Never claims it is immediate. */
export function assignmentEffect(app: string): string {
  if (app === 'admin') return 'This takes effect on their next admin request.'
  return `Users already signed in to ${app} may keep (or not yet get) this change until their current token expires, up to ${APP_TOKEN_MAX_HOURS} hours.`
}

type ExpiresAt =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/**
 * `datetime-local` value -> ISO string with an offset (`Z`), or `null` when
 * empty. Advisory: the server clock decides `expires_in_past`.
 */
export function toExpiresAt(local: string, now: Date = new Date()): ExpiresAt {
  const text = local.trim()
  if (!text) return { ok: true, value: null }
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return { ok: false, error: 'Enter a valid date and time.' }
  // A time inside a DST gap is silently shifted by Date: reject it.
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) &&
    toLocalInput(date) !== text
  )
    return { ok: false, error: "This time doesn't exist in your time zone." }
  if (date.getTime() <= now.getTime())
    return { ok: false, error: 'Pick a time in the future.' }
  return { ok: true, value: date.toISOString() }
}

function utcOffset(): string {
  const minutes = -new Date().getTimezoneOffset()
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** e.g. `Asia/Ho_Chi_Minh, UTC+07:00`. */
export function zoneLabel(): string {
  return `${Intl.DateTimeFormat().resolvedOptions().timeZone}, ${utcOffset()}`
}

/** App-wide, an organization name, or the id when the name is unknown. */
export function scopeLabel(orgId: string | null, orgName?: string): string {
  if (orgId === null) return 'App-wide'
  return orgName ?? `Organization ${orgId}`
}
