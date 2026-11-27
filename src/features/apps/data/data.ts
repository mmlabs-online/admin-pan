import { formatDate as formatSharedDate } from '@/lib/format'
import {
  ADMIN_APP_KEY,
  type AppCredentialScope,
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

export const joinRequestStatusOptions: {
  label: string
  value: 'pending' | 'approved' | 'rejected'
}[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

/** The schema types `status` as a plain string, so unexpected values are named. */
export function joinRequestStatusLabel(status: string): string {
  return (
    joinRequestStatusOptions.find((o) => o.value === status)?.label ?? 'Unknown'
  )
}

/** Name when it has visible text, else the email. */
export const requesterLabel = (r: {
  display_name?: string | null
  email: string
}): string => r.display_name?.trim() || r.email

export const permissionScopeLabels: Record<PermissionScope, string> = {
  app: 'App',
  org: 'Org',
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return formatSharedDate(iso)
}

// Shown on the admin app's form, sheet, status and permission dialogs; the API
// enforces all of it (D19, ADM-002b).
export const ADMIN_APP_NOTE =
  "Changes to the admin app need the admin:* permission. It must stay active, closed, with org mode None, at most 2 origins and no localhost. Removing this console's own origin locks everyone out of it."

/** `limits:write` is refused by the API until org-admin-api ADM-044. */
export const ISSUABLE_SCOPES: readonly AppCredentialScope[] = [
  'manifest',
  'releases',
  'org-members:read',
  'usage:read',
  'usage:write',
]

/** Scopes offered when issuing a credential; the API refuses the rest. */
export const credentialScopeOptions = (
  appKey: string
): readonly AppCredentialScope[] =>
  appKey === ADMIN_APP_KEY ? ['releases'] : ISSUABLE_SCOPES

const RUNTIME_SCOPES: readonly AppCredentialScope[] = [
  'org-members:read',
  'usage:read',
  'usage:write',
  'limits:write',
]

/** Runtime scopes are used by the app's backend, never by CI. */
export const isRuntimeScope = (scope: AppCredentialScope): boolean =>
  RUNTIME_SCOPES.includes(scope)

const RUNTIME_ADVICE =
  'Backend deploy environment only, never CI or browser code.'

export const credentialScopeHints: Record<AppCredentialScope, string> = {
  manifest:
    "Deploy jobs publish the app's permission manifest with it. Store it in the CI deploy secret store.",
  releases:
    "Deploy jobs record the app's releases with it. Store it in the CI deploy secret store.",
  'org-members:read': `The app's backend reads an org's members and invitations with it. ${RUNTIME_ADVICE}`,
  'usage:read': `The app's backend reads usage with it. ${RUNTIME_ADVICE}`,
  'usage:write': `The app's backend reports usage with it. ${RUNTIME_ADVICE}`,
  'limits:write': 'Not available yet.',
}

export const CREDENTIAL_LIMIT_NOTE =
  'Each scope can have at most 2 active credentials.'
