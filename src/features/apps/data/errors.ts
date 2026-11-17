import { isApiError } from '@/api'
import { forbiddenCopy, isForbidden, type ForbiddenCopy } from '@/lib/forbidden'

export type AppAlert =
  | { kind: 'forbidden'; copy: ForbiddenCopy }
  | { kind: 'message'; text: string }

export type AppFormField =
  | 'key'
  | 'name'
  | 'join_policy'
  | 'org_mode'
  | 'origins'
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
]
const NO_LONGER_EXISTS = 'This app no longer exists.'
const REJECTED = 'The API rejected these values.'
const CHANGED =
  'This app was changed by someone else. Close the dialog and try again.'

const message = (text: string): AppAlert => ({ kind: 'message', text })

function fallback(error: unknown): AppAlert {
  if (isForbidden(error))
    return { kind: 'forbidden', copy: forbiddenCopy(error) }
  if (isApiError(error, 404)) return message(NO_LONGER_EXISTS)
  if (isApiError(error)) return message(error.message.slice(0, 200))
  return message('Something went wrong.')
}

/** `details` entries as objects; anything else is ignored. */
function detailObjects(error: unknown): Record<string, unknown>[] {
  if (!isApiError(error) || !Array.isArray(error.details)) return []
  return error.details.filter(
    (d): d is Record<string, unknown> => typeof d === 'object' && d !== null
  )
}

const firstReason = (error: unknown): string | undefined => {
  const reason = detailObjects(error)[0]?.reason
  return typeof reason === 'string' ? reason : undefined
}

/** `loc` of a FastAPI validation entry as `[body, field, ...]`. */
function bodyFields(error: unknown): { field: string; msg: string }[] {
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
  role_has_org_permissions: [
    'org_mode',
    "The default role holds org-scoped permissions, so org mode can't be Required.",
  ],
  org_mode_required: [
    'org_mode',
    'This app has an org owner role, so org mode must stay Required.',
  ],
}

/**
 * Maps a failed register/edit to field errors and an alert, by status, code
 * and `details[].reason` (ADR 0004). The server text is never shown for the
 * mapped cases; the first matching rule wins.
 */
export function appFormError(
  error: unknown,
  ctx: { mode: 'create' | 'edit'; appKey?: string }
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
      const mapped = UNPROCESSABLE_FIELD[firstReason(error) ?? '']
      return mapped
        ? { fields: { [mapped[0]]: mapped[1] }, alert: null }
        : { fields: {}, alert: message(REJECTED) }
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
export function credentialIssueError(error: unknown): AppAlert {
  if (isUnknownOutcome(error))
    return message(
      "We couldn't confirm whether the credential was created. Check the list and revoke any key ID you don't recognise."
    )
  if (isApiError(error, 409)) {
    switch (firstReason(error)) {
      case 'admin_app':
        return message('The admin app has no credentials.')
      case 'app_disabled':
        return message(
          'This app is disabled. Enable it before issuing a credential.'
        )
      case 'credential_limit':
        return message(
          'This app already has 2 active credentials. Revoke one, then issue a new one.'
        )
      default:
        return message('The API refused to issue a credential for this app.')
    }
  }
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
