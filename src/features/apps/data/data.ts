import { type JoinPolicy, type OrgMode, type AppStatus } from './schema'

export const joinPolicyOptions: { label: string; value: JoinPolicy }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Approval', value: 'approval' },
  { label: 'Closed', value: 'closed' },
]

export const orgModeOptions: { label: string; value: OrgMode }[] = [
  { label: 'None', value: 'none' },
  { label: 'Required', value: 'required' },
]

export const appStatusLabels: Record<AppStatus, string> = {
  active: 'Active',
  disabled: 'Disabled',
}

export const joinPolicyLabels: Record<JoinPolicy, string> = {
  open: 'Open',
  approval: 'Approval',
  closed: 'Closed',
}

export const orgModeLabels: Record<OrgMode, string> = {
  none: 'None',
  required: 'Required',
}

// Key segments of apps, roles and permissions: lowercase, digits, hyphens.
export const KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/

/** True when `value` is a bare https origin, e.g. `https://app.example.com`. */
export function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === value
  } catch {
    return false
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
