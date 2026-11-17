import {
  type AppStatus,
  type JoinPolicy,
  type OrgMode,
  type PermissionScope,
} from './app-schema'

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

export const permissionScopeLabels: Record<PermissionScope, string> = {
  app: 'App',
  org: 'Org',
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Shown on the admin app's form, sheet, status and permission dialogs; the API
// enforces all of it (D19, ADM-002b).
export const ADMIN_APP_NOTE =
  "Changes to the admin app need the admin:* permission. It must stay active, closed, with org mode None, at most 2 origins and no localhost. Removing this console's own origin locks everyone out of it."
