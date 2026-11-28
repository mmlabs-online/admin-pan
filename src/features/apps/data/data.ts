import { formatDate as formatSharedDate } from '@/lib/format'
import { type RoleDefinition } from '@/features/roles/data/role-schema'
import {
  ADMIN_APP_KEY,
  APP_ROLE_FIELDS,
  ROLE_NONE,
  type App,
  type AppCredentialScope,
  type AppForm,
  type AppRoleField,
  type AppStatus,
  type AppUpdate,
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

export const ROLE_FIELD_LABELS: Record<AppRoleField, string> = {
  default_role_id: 'Default role',
  org_owner_role_id: 'Org owner role',
  super_admin_role_id: 'Super-admin role',
}

const sameOrigins = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * The PATCH body: only fields that changed. A role field is considered only
 * when it is in `editable`, so an untouched or unresolved role is never sent
 * (and never sent as `null`).
 */
export function appUpdateDiff(
  current: App,
  values: AppForm,
  editable: readonly AppRoleField[]
): AppUpdate {
  const origins = values.origins.map((o) => o.value.trim())
  const diff: AppUpdate = {
    ...(values.name !== current.name && { name: values.name }),
    ...(values.join_policy !== current.join_policy && {
      join_policy: values.join_policy,
    }),
    ...(values.org_mode !== current.org_mode && { org_mode: values.org_mode }),
    ...(!sameOrigins(origins, current.origins) && { origins }),
  }
  for (const field of APP_ROLE_FIELDS) {
    if (!editable.includes(field)) continue
    const next = values[field] === ROLE_NONE ? null : values[field]
    if (next !== (current[field] ?? null)) diff[field] = next
  }
  return diff
}

export const unknownRoleLabel = (id: string) => `Unknown role (${id})`

/** "None", then the app's roles as `key — name`, by key. */
export function roleSelectItems(
  roles: RoleDefinition[],
  currentId: string | null | undefined,
  { annotatePrivileged }: { annotatePrivileged: boolean }
): { value: string; label: string }[] {
  const items = [...roles]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => ({
      value: r.id,
      label: `${r.key} — ${r.name}${annotatePrivileged && r.privileged ? ' · privileged' : ''}`,
    }))
  const out = [{ value: ROLE_NONE, label: 'None' }, ...items]
  if (currentId && !roles.some((r) => r.id === currentId))
    out.push({ value: currentId, label: unknownRoleLabel(currentId) })
  return out
}

export type RoleDescription =
  | { kind: 'none' }
  | { kind: 'role'; key: string }
  | { kind: 'unknown'; id: string }

export function describeRole(
  id: string | null | undefined,
  byId: Map<string, RoleDefinition>
): RoleDescription {
  if (!id) return { kind: 'none' }
  const role = byId.get(id)
  return role ? { kind: 'role', key: role.key } : { kind: 'unknown', id }
}

const roleText = (d: RoleDescription) =>
  d.kind === 'none'
    ? 'None'
    : d.kind === 'role'
      ? d.key
      : unknownRoleLabel(d.id)

export type RoleChange = {
  field: AppRoleField
  label: string
  from: string
  to: string
  consequence: string
}

const EXPIRY = 'Tokens already issued'

function consequenceFor(
  field: AppRoleField,
  from: RoleDescription,
  to: RoleDescription,
  appName: string
): string {
  const cleared = to.kind === 'none'
  if (field === 'default_role_id')
    return cleared
      ? `Accounts that join ${appName} from now on get no role automatically.`
      : `Accounts that join ${appName} from now on get this role. Existing assignments don't change.`
  if (field === 'org_owner_role_id')
    return cleared
      ? `Org creation and invitations stop working for ${appName}.`
      : `New org owners in every ${appName} organization get this role. Existing assignments don't change.`
  if (cleared)
    return `New super-admin access to ${appName} stops at once. ${EXPIRY} stay valid until they expire (up to 1 hour). Holders keep the role assignment; revoke it on the Roles page afterwards.`
  const set = `Staff super-admins who hold this role can open any organization of ${appName} without being a member.`
  return from.kind === 'none'
    ? set
    : `${set} ${EXPIRY} for ${roleText(from)} stay valid until they expire (up to 1 hour); its holders keep the assignment.`
}

/** The role changes of a diff, for the review step; `others` are the other changed fields. */
export function roleChanges(
  current: App,
  diff: AppUpdate,
  byId: Map<string, RoleDefinition>,
  appName: string
): { changes: RoleChange[]; others: string[] } {
  const changes: RoleChange[] = []
  for (const field of APP_ROLE_FIELDS) {
    if (!(field in diff)) continue
    const from = describeRole(current[field], byId)
    const to = describeRole(diff[field], byId)
    changes.push({
      field,
      label: ROLE_FIELD_LABELS[field],
      from: roleText(from),
      to: roleText(to),
      consequence: consequenceFor(field, from, to, appName),
    })
  }
  const labels: Record<string, string> = {
    name: 'Name',
    join_policy: 'Join policy',
    org_mode: 'Org mode',
    origins: 'Origins',
  }
  const others = Object.keys(diff)
    .filter((k) => k in labels)
    .map((k) => labels[k])
  return { changes, others }
}

/** The super-admin role is saved on its own (strongest cross-org power). */
export const superAdminNotAlone = (diff: AppUpdate): boolean =>
  'super_admin_role_id' in diff && Object.keys(diff).length > 1
