import { isApiError } from '@/api'
import { forbiddenCopy, isForbidden, type ForbiddenCopy } from '@/lib/forbidden'
import { type AppCredentialScope } from './app-schema'

export type AppAlert =
  | { kind: 'forbidden'; copy: ForbiddenCopy }
  | { kind: 'message'; text: string }

export type AppFormField =
  | 'key'
  | 'name'
  | 'join_policy'
  | 'org_mode'
  | 'origins'
  | 'default_role_id'
  | 'org_owner_role_id'
  | 'super_admin_role_id'
export type PermissionFormField = 'resource' | 'action' | 'description'

export type FormError<F extends string> = {
  fields: Partial<Record<F, string>>
  alert: AppAlert | null
}

const APP_FIELDS: readonly string[] = [
  'key',
  'name',
  'join_policy',
  'org_mode',
  'origins',
  'default_role_id',
  'org_owner_role_id',
  'super_admin_role_id',
]
const NO_LONGER_EXISTS = 'This app no longer exists.'
const REJECTED = 'The API rejected these values.'
const CHANGED =
  'This app was changed by someone else. Close the dialog and try again.'

export const message = (text: string): AppAlert => ({ kind: 'message', text })

export function fallback(error: unknown): AppAlert {
  if (isForbidden(error))
    return { kind: 'forbidden', copy: forbiddenCopy(error) }
  if (isApiError(error, 404)) return message(NO_LONGER_EXISTS)
  if (isApiError(error)) return message(error.message.slice(0, 200))
  return message('Something went wrong.')
}

/** `details` entries as objects; anything else is ignored. */
export function detailObjects(error: unknown): Record<string, unknown>[] {
  if (!isApiError(error) || !Array.isArray(error.details)) return []
  return error.details.filter(
    (d): d is Record<string, unknown> => typeof d === 'object' && d !== null
  )
}

export const firstReason = (error: unknown): string | undefined => {
  const reason = detailObjects(error)[0]?.reason
  return typeof reason === 'string' ? reason : undefined
}

/** `loc` of a FastAPI validation entry as `[body, field, ...]`. */
export function bodyFields(error: unknown): { field: string; msg: string }[] {
  const out: { field: string; msg: string }[] = []
  for (const d of detailObjects(error)) {
    const loc = Array.isArray(d.loc) ? d.loc : []
    if (
      loc[0] === 'body' &&
      typeof loc[1] === 'string' &&
      typeof d.msg === 'string'
    )
      out.push({ field: loc[1], msg: d.msg.slice(0, 200) })
  }
  return out
}

const UNPROCESSABLE_FIELD: Record<string, [AppFormField, string]> = {
  apex_not_allowed: [
    'origins',
    "The admin app can't use https://mmlabs.online.",
  ],
  too_many_origins: ['origins', 'The admin app can have at most 2 origins.'],
  loopback_not_allowed: [
    'origins',
    "The admin app can't use localhost origins in this environment.",
  ],
}

const firstField = (error: unknown): string | undefined => {
  const field = detailObjects(error)[0]?.field
  return typeof field === 'string' ? field : undefined
}

const CONFLICT_BY_FIELD: Record<string, [AppFormField, string]> = {
  'super_admin_role_id/role_has_assignments': [
    'super_admin_role_id',
    'Users already hold this role. Revoke its assignments on the Roles page, then designate it.',
  ],
  'org_mode/super_admin_role_designated': [
    'org_mode',
    'This app has a super-admin role, so org mode must stay Required. Clear the super-admin role first.',
  ],
  'org_mode/org_mode_in_use': [
    'org_mode',
    "This app still has organization data (entitlements or org role assignments), so org mode can't be None. Revoke them first.",
  ],
}

const NO_SUCH_ROLE = 'This role no longer exists in this app. Choose another.'
const OWNER_NEEDS_ORG =
  'This app has an org owner role, so org mode must stay Required.'

// Keyed by `${details[0].field}/${reason}`: the same reason arrives on several
// fields. `alt` is the field to use when `field` was not in the PATCH body
// but `alt` was (the refusal is then about the other field).
type Refusal = {
  field: AppFormField
  copy: string | ((appKey: string | undefined) => string)
  alt?: { field: AppFormField; copy: string }
}
const UNPROCESSABLE_BY_FIELD: Record<string, Refusal> = {
  'default_role_id/unknown_role': {
    field: 'default_role_id',
    copy: NO_SUCH_ROLE,
  },
  'org_owner_role_id/unknown_role': {
    field: 'org_owner_role_id',
    copy: NO_SUCH_ROLE,
  },
  'super_admin_role_id/unknown_role': {
    field: 'super_admin_role_id',
    copy: NO_SUCH_ROLE,
  },
  'default_role_id/role_has_admin_permissions': {
    field: 'default_role_id',
    copy: "This role holds admin-only permissions, so it can't be the default role.",
  },
  'default_role_id/role_has_org_permissions': {
    field: 'default_role_id',
    copy: "This app requires organizations and this role holds org-scoped permissions, so it can't be the default role.",
    alt: {
      field: 'org_mode',
      copy: "The default role holds org-scoped permissions, so org mode can't be Required.",
    },
  },
  'default_role_id/same_as_super_admin_role': {
    field: 'default_role_id',
    copy: "This role is the super-admin role, so it can't also be the default role.",
  },
  'org_owner_role_id/role_has_admin_permissions': {
    field: 'org_owner_role_id',
    copy: "This role holds admin-only permissions, so it can't be the org owner role. Choose another role, or remove its admin-only permissions on the Roles page.",
  },
  'org_owner_role_id/org_mode_required': {
    field: 'org_owner_role_id',
    copy: 'An org owner role needs org mode Required.',
    alt: { field: 'org_mode', copy: OWNER_NEEDS_ORG },
  },
  'org_owner_role_id/same_as_default_role': {
    field: 'org_owner_role_id',
    copy: "This role is the default role, so it can't also be the org owner role.",
    alt: {
      field: 'default_role_id',
      copy: "This role is the org owner role, so it can't also be the default role.",
    },
  },
  'org_owner_role_id/same_as_super_admin_role': {
    field: 'org_owner_role_id',
    copy: "This role is the super-admin role, so it can't also be the org owner role.",
  },
  'super_admin_role_id/admin_app_not_allowed': {
    field: 'super_admin_role_id',
    copy: "The admin app can't have a super-admin role.",
  },
  'super_admin_role_id/org_mode_required': {
    field: 'super_admin_role_id',
    copy: 'A super-admin role needs org mode Required.',
  },
  'super_admin_role_id/system_role': {
    field: 'super_admin_role_id',
    copy: "System roles can't be the super-admin role.",
  },
  'super_admin_role_id/same_as_default_role': {
    field: 'super_admin_role_id',
    copy: "This role is the default role, so it can't also be the super-admin role.",
  },
  'super_admin_role_id/same_as_org_owner_role': {
    field: 'super_admin_role_id',
    copy: "This role is the org owner role, so it can't also be the super-admin role.",
  },
  'super_admin_role_id/role_has_org_permissions': {
    field: 'super_admin_role_id',
    copy: 'This role holds org-scoped permissions. The super-admin role may hold app-level permissions only.',
  },
  'super_admin_role_id/wildcard_not_allowed': {
    field: 'super_admin_role_id',
    copy: (appKey) =>
      `This role holds ${appKey ?? 'this app'}:*, so it can't be the super-admin role.`,
  },
}

/** `field` if it was sent, else `alt` if that was, else `field`. */
function refusalTarget(
  r: Refusal,
  sent: readonly string[]
): { field: AppFormField; copy: string } {
  const copy = typeof r.copy === 'function' ? '' : r.copy
  if (r.alt && !sent.includes(r.field) && sent.includes(r.alt.field))
    return r.alt
  return { field: r.field, copy }
}

/**
 * Maps a failed register/edit to field errors and an alert, by status, code
 * and `details[].reason` (ADR 0004). The server text is never shown for the
 * mapped cases; the first matching rule wins.
 */
export function appFormError(
  error: unknown,
  ctx: {
    mode: 'create' | 'edit'
    appKey?: string
    /** Keys of the PATCH body, to route reasons shared by several fields. */
    sent?: readonly string[]
  }
): FormError<AppFormField> {
  if (isApiError(error, 409)) {
    if (firstReason(error) === 'origin_taken')
      return {
        fields: {
          origins: 'One of these origins is already registered to another app.',
        },
        alert: null,
      }
    if (error.code === 'conflict' && ctx.mode === 'create')
      return {
        fields: { key: 'An app with this key already exists.' },
        alert: null,
      }
    const reason = firstReason(error)
    if (reason !== undefined) {
      const mapped = CONFLICT_BY_FIELD[`${firstField(error)}/${reason}`]
      return mapped
        ? { fields: { [mapped[0]]: mapped[1] }, alert: null }
        : { fields: {}, alert: message('The API refused this change.') }
    }
    return {
      fields: {},
      alert: message(
        ctx.appKey === 'admin'
          ? 'The admin app must stay active, closed, with org mode None and no default role.'
          : CHANGED
      ),
    }
  }
  if (isApiError(error, 422)) {
    if (error.code === 'unprocessable') {
      const reason = firstReason(error) ?? ''
      const origin = UNPROCESSABLE_FIELD[reason]
      if (origin) return { fields: { [origin[0]]: origin[1] }, alert: null }
      const refusal =
        UNPROCESSABLE_BY_FIELD[`${firstField(error) ?? ''}/${reason}`]
      if (!refusal) return { fields: {}, alert: message(REJECTED) }
      const target = refusalTarget(refusal, ctx.sent ?? [])
      const text =
        typeof refusal.copy === 'function' && target.field === refusal.field
          ? refusal.copy(ctx.appKey)
          : target.copy
      return { fields: { [target.field]: text }, alert: null }
    }
    if (error.code === 'validation_error') {
      const fields: FormError<AppFormField>['fields'] = {}
      for (const { field, msg } of bodyFields(error))
        if (APP_FIELDS.includes(field)) fields[field as AppFormField] ??= msg
      return {
        fields,
        alert: Object.keys(fields).length ? null : message(REJECTED),
      }
    }
  }
  if (ctx.mode === 'edit' && isForbidden(error)) {
    const copy = forbiddenCopy(error)
    return {
      fields: {},
      alert: {
        kind: 'forbidden',
        copy: {
          ...copy,
          description: `${copy.description} Nothing was saved.`,
        },
      },
    }
  }
  return { fields: {}, alert: fallback(error) }
}

/** Maps a failed `PATCH {status}` to what the dialog shows. */
export function appStatusError(error: unknown, appKey: string): AppAlert {
  if (isApiError(error, 409))
    return message(
      appKey === 'admin' ? 'The admin app must stay active.' : CHANGED
    )
  return fallback(error)
}

/** Maps a failed add-permission to field errors and an alert. */
export function permissionFormError(
  error: unknown
): FormError<PermissionFormField> {
  if (isApiError(error, 409))
    return {
      fields: { action: 'A permission with this key already exists.' },
      alert: null,
    }
  if (isApiError(error, 422)) {
    if (error.code === 'validation_error') {
      const fields: FormError<PermissionFormField>['fields'] = {}
      for (const { field, msg } of bodyFields(error)) {
        if (field === 'key') fields.action ??= msg
        else if (field === 'description') fields.description ??= msg
      }
      return {
        fields,
        alert: Object.keys(fields).length ? null : message(REJECTED),
      }
    }
    if (error.code === 'unprocessable') {
      switch (firstReason(error)) {
        case 'prefix_mismatch':
          return {
            fields: {},
            alert: message('The key must start with the app key.'),
          }
        case 'admin_app_permission_must_be_admin':
        case 'wildcard_must_be_admin':
          return {
            fields: {},
            alert: message('This permission must be admin only.'),
          }
        case 'reserved_scope':
          return {
            fields: {},
            alert: message('This key has a fixed scope.'),
          }
        default:
          return { fields: {}, alert: message(REJECTED) }
      }
    }
  }
  return { fields: {}, alert: fallback(error) }
}

/** Maps a failed `PATCH {is_admin}` to what the confirm dialog shows. */
export function permissionAdminError(error: unknown): AppAlert {
  if (isApiError(error, 409)) {
    if (
      firstReason(error) === 'role_has_assignments' ||
      error.code === 'role_has_assignments'
    )
      return message(
        'A role that holds this permission has assignments. Revoke them first, then try again.'
      )
    return message(
      "The app's default role or org owner role holds this permission. Remove it from that role first."
    )
  }
  if (isApiError(error, 422))
    return message('This permission is always admin only.')
  if (isApiError(error, 404))
    return message('This permission no longer exists.')
  return fallback(error)
}

/** The request may have reached the API: a create might have committed. */
export function isUnknownOutcome(error: unknown): boolean {
  if (!isApiError(error)) return false
  return (
    error.kind === 'network' ||
    error.kind === 'timeout' ||
    error.kind === 'aborted' ||
    error.kind === 'invalid_response' ||
    (error.kind === 'http' && error.status >= 500)
  )
}

/** Maps a failed issue to what the dialog shows (ADR-0016 §5). */
export function credentialIssueError(
  error: unknown,
  scope: AppCredentialScope
): AppAlert {
  if (isUnknownOutcome(error))
    return message(
      "We couldn't confirm whether the credential was created. Check the list and revoke any key ID you don't recognise."
    )
  if (isApiError(error, 409)) {
    switch (firstReason(error)) {
      case 'admin_app':
        return message('The admin app can only have releases credentials.')
      case 'app_disabled':
        return message(
          'This app is disabled. Enable it before issuing a credential.'
        )
      case 'scope_not_available':
        return message("This scope can't be issued yet.")
      case 'credential_limit':
        return message(
          `This app already has 2 active ${scope} credentials. Revoke one, then issue a new one.`
        )
      default:
        return message('The API refused to issue a credential for this app.')
    }
  }
  if (isApiError(error, 422)) return message('The API rejected this scope.')
  return fallback(error)
}

/** Maps a failed revoke to what the confirm dialog shows. */
export function credentialRevokeError(error: unknown): AppAlert {
  if (isApiError(error, 404))
    return message('This credential no longer exists.')
  if (isUnknownOutcome(error))
    return message(
      "We couldn't confirm the revoke. Check the list; revoking again is safe."
    )
  return fallback(error)
}

/** The first 409 `details[].reason` of a failed decision, if any. */
export const joinRequestRefusal = (error: unknown): string | undefined =>
  isApiError(error, 409) ? firstReason(error) : undefined

const DECISION_409: Record<string, string> = {
  not_pending:
    'Someone already decided this request. The list has been refreshed.',
  app_disabled: 'This app is disabled. Enable it before approving requests.',
  join_policy_changed:
    "This app no longer requires approval, so the request can't be approved. You can still reject it.",
  user_disabled:
    "This user's account is disabled, so the request can't be approved.",
  email_unverified:
    "This user hasn't verified their email, so the request can't be approved.",
  default_role_unusable:
    "This app's default role is missing or can't be granted. Fix the app's default role, then try again.",
}

/** Maps a failed approve/reject to fixed copy; server text is never shown. */
export function joinRequestDecisionError(error: unknown): AppAlert {
  if (isUnknownOutcome(error))
    return message(
      "We couldn't confirm the decision. Check the list before trying again."
    )
  if (isApiError(error, 404))
    return message('This join request no longer exists.')
  if (isApiError(error, 409))
    return message(
      DECISION_409[firstReason(error) ?? ''] ??
        'The API refused this decision. Refresh the list and try again.'
    )
  if (isForbidden(error))
    return { kind: 'forbidden', copy: forbiddenCopy(error) }
  return message(
    'The API refused this decision. Refresh the list and try again.'
  )
}
