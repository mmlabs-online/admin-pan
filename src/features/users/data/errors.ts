import { isApiError } from '@/api'
import { forbiddenCopy, isForbidden, type ForbiddenCopy } from '@/lib/forbidden'
import {
  bodyFields,
  firstReason,
  isUnknownOutcome,
  message,
  type AppAlert,
  type FormError,
} from '@/features/apps/data/errors'

type StatusChangeError =
  | { kind: 'forbidden'; copy: ForbiddenCopy }
  | { kind: 'message'; text: string }

/** Maps a failed `PATCH /users/{id}` to what the dialog shows (by code, ADR 0004). */
export function statusChangeError(error: unknown): StatusChangeError {
  if (isForbidden(error))
    return { kind: 'forbidden', copy: forbiddenCopy(error) }
  if (isApiError(error, 409) && error.code === 'last_super_admin')
    return {
      kind: 'message',
      text: "You can't disable the last active super admin.",
    }
  if (isApiError(error, 404))
    return { kind: 'message', text: 'This user no longer exists.' }
  if (isApiError(error))
    return { kind: 'message', text: error.message.slice(0, 200) }
  return { kind: 'message', text: 'Something went wrong.' }
}

type SessionRevokeError =
  | { kind: 'gone' }
  | { kind: 'forbidden'; copy: ForbiddenCopy }
  | { kind: 'message'; text: string }

/** Maps a failed session revoke to what the dialog shows. Never the server message. */
export function sessionRevokeError(error: unknown): SessionRevokeError {
  if (isApiError(error, 404)) return { kind: 'gone' }
  if (isForbidden(error))
    return { kind: 'forbidden', copy: forbiddenCopy(error) }
  if (isUnknownOutcome(error))
    return {
      kind: 'message',
      text: "We couldn't confirm the revoke. Check the list; revoking again is safe.",
    }
  return {
    kind: 'message',
    text: 'The API refused this revoke. Refresh the list and try again.',
  }
}

type AssignField = 'user' | 'role' | 'org' | 'expires_at'

const ASSIGN_REJECTED = 'The API rejected these values.'
const UNPROCESSABLE_FIELD: Record<string, [AssignField, string]> = {
  org_id_not_allowed: [
    'org',
    "This app doesn't use organizations; grant it app-wide.",
  ],
  unknown_org: ['org', 'This organization no longer exists.'],
  expires_in_past: [
    'expires_at',
    "This time is already past by the server's clock. Pick a later time.",
  ],
  expiry_not_allowed: ['expires_at', "admin:super-admin can't have an expiry."],
  unknown_role: [
    'role',
    'This role no longer exists. The role list was refreshed.',
  ],
}
const BODY_FIELD: Record<string, AssignField> = {
  role_id: 'role',
  org_id: 'org',
  expires_at: 'expires_at',
}

/** Maps a failed `POST …/role-assignments` to fields and an alert (by code and reason, ADR 0004). Never the server text. */
export function assignRoleError(error: unknown): FormError<AssignField> {
  const alert = (a: AppAlert) => ({ fields: {}, alert: a })
  if (isUnknownOutcome(error))
    return alert(
      message(
        "We couldn't confirm whether the role was granted. Check the list before trying again."
      )
    )
  if (isForbidden(error))
    return alert({ kind: 'forbidden', copy: forbiddenCopy(error) })
  if (isApiError(error, 409))
    return alert(
      message(
        'This user already has this role in this scope, or it changed at the same time. The list was refreshed.'
      )
    )
  if (isApiError(error, 422)) {
    if (error.code === 'unprocessable') {
      const mapped = UNPROCESSABLE_FIELD[firstReason(error) ?? '']
      return mapped
        ? { fields: { [mapped[0]]: mapped[1] }, alert: null }
        : alert(message(ASSIGN_REJECTED))
    }
    if (error.code === 'validation_error') {
      const fields: FormError<AssignField>['fields'] = {}
      for (const { field, msg } of bodyFields(error)) {
        const mapped = BODY_FIELD[field]
        if (mapped) fields[mapped] ??= msg
      }
      return Object.keys(fields).length
        ? { fields, alert: null }
        : alert(message(ASSIGN_REJECTED))
    }
  }
  if (isApiError(error, 404))
    return alert(message('This user no longer exists.'))
  return alert(message('Something went wrong. Try again.'))
}

type AssignmentRevokeError = { kind: 'gone' } | AppAlert

/** Maps a failed role-assignment revoke. Never the server message. */
export function revokeAssignmentError(error: unknown): AssignmentRevokeError {
  if (isApiError(error, 404)) return { kind: 'gone' }
  if (isForbidden(error))
    return { kind: 'forbidden', copy: forbiddenCopy(error) }
  if (isApiError(error, 409))
    return message(
      error.code === 'last_super_admin'
        ? 'This is the last active super admin. Grant admin:super-admin to someone else first.'
        : 'This assignment changed at the same time. The list was refreshed; try again.'
    )
  if (isUnknownOutcome(error))
    return message(
      "We couldn't confirm the revoke; it may have been applied. Check the list; revoking again is safe."
    )
  return message('The API refused this revoke. Refresh the list and try again.')
}
