import { isApiError } from '@/api'
import {
  bodyFields,
  detailObjects,
  fallback,
  firstReason,
  isUnknownOutcome,
  message,
  type AppAlert,
  type FormError,
} from '@/features/apps/data/errors'

export type RoleCreateField = 'segment' | 'name'

const ROLE_GONE = 'This role no longer exists.'
const REJECTED = 'The API rejected these values.'
const CHANGED =
  'This role was changed by someone else. Close the dialog and try again.'

// Server text is shown as text only (R6) and cut short.
const serverText = (e: { message: string }) => e.message.slice(0, 200)

/** Role-specific 404 first: `fallback`'s 404 text talks about the app. */
function roleFallback(error: unknown): AppAlert {
  if (isApiError(error, 404)) return message(ROLE_GONE)
  return fallback(error)
}

/** Maps a failed `POST …/roles` to field errors and an alert. */
export function roleCreateError(
  error: unknown,
  ctx: { appKey: string; afterUnknown?: boolean }
): FormError<RoleCreateField> {
  if (isUnknownOutcome(error))
    return {
      fields: {},
      alert: message(
        "We couldn't confirm whether the role was created. Check the list before trying again."
      ),
    }
  if (isApiError(error, 409))
    return {
      fields: {
        segment:
          'A role with this key already exists.' +
          (ctx.afterUnknown
            ? ' It may have just been created; check the list.'
            : ''),
      },
      alert: null,
    }
  if (isApiError(error, 422)) {
    if (
      error.code === 'unprocessable' &&
      firstReason(error) === 'prefix_mismatch'
    )
      return {
        fields: { segment: `The key must start with ${ctx.appKey}:` },
        alert: null,
      }
    if (error.code === 'validation_error') {
      const fields: FormError<RoleCreateField>['fields'] = {}
      for (const { field, msg } of bodyFields(error)) {
        if (field === 'key') fields.segment ??= msg
        else if (field === 'name') fields.name ??= msg
      }
      return {
        fields,
        alert: Object.keys(fields).length ? null : message(REJECTED),
      }
    }
    return { fields: {}, alert: message(REJECTED) }
  }
  return { fields: {}, alert: fallback(error) }
}

/** Maps a failed rename to a name error or an alert. */
export function roleRenameError(error: unknown): FormError<'name'> {
  if (isApiError(error, 422) && error.code === 'validation_error') {
    const name = bodyFields(error).find((f) => f.field === 'name')
    if (name) return { fields: { name: name.msg }, alert: null }
    return { fields: {}, alert: message(REJECTED) }
  }
  if (isApiError(error, 409)) return { fields: {}, alert: message(CHANGED) }
  return { fields: {}, alert: roleFallback(error) }
}

/** Maps a failed permission replace to what the dialog shows. */
export function rolePermissionsError(error: unknown): AppAlert {
  if (isApiError(error, 409)) {
    if (
      firstReason(error) === 'role_has_assignments' ||
      error.code === 'role_has_assignments'
    )
      return message(
        "Users hold this role, so admin-only permissions can't be added to it. Revoke its assignments, change the permissions, then grant it again."
      )
    return message(
      `The API refused this permission set (a default, org owner or super-admin role rule, or a concurrent change): ${serverText(error)}`
    )
  }
  if (isApiError(error, 422)) {
    if (error.code === 'unprocessable') {
      const reason = firstReason(error)
      if (reason === 'unknown_permission') {
        const keys = detailObjects(error)
          .map((d) => d.key)
          .filter((k): k is string => typeof k === 'string')
          .slice(0, 10)
        return message(`These permissions no longer exist: ${keys.join(', ')}.`)
      }
      if (reason === 'wildcard_super_admin_only')
        return message('Only the admin:super-admin role can hold admin:*.')
    }
    return message(REJECTED)
  }
  return roleFallback(error)
}

/** Maps a failed delete to what the confirm dialog shows. */
export function roleDeleteError(error: unknown): AppAlert {
  if (isApiError(error, 409))
    return message(
      `This role can't be deleted: it is a system role, the app's default or org owner role, or users still hold it. API: ${serverText(error)}`
    )
  if (isUnknownOutcome(error))
    return message("We couldn't confirm the delete. Check the list.")
  return roleFallback(error)
}

/** Maps a failed `PATCH /apps/{key} {default_role_id}` to what the dialog shows. */
export function roleDefaultError(error: unknown, appKey: string): AppAlert {
  if (isApiError(error, 422)) {
    switch (firstReason(error)) {
      case 'role_has_admin_permissions':
        return message(
          "This role holds admin-only permissions, so it can't be the default role."
        )
      case 'role_has_org_permissions':
        return message(
          "This app requires organizations and this role holds org-scoped permissions, so it can't be the default role."
        )
      case 'unknown_role':
        return message(ROLE_GONE)
      case 'same_as_default_role':
        return message(
          "This role is the app's org owner role, so it can't also be the default role."
        )
      default:
        return message(REJECTED)
    }
  }
  if (isApiError(error, 409))
    return message(
      appKey === 'admin'
        ? "The admin app can't have a default role."
        : 'This app was changed by someone else. Close the dialog and try again.'
    )
  return fallback(error)
}
