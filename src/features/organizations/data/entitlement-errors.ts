import { isApiError } from '@/api'
import { forbiddenCopy, isForbidden, type ForbiddenCopy } from '@/lib/forbidden'
import { isUnknownOutcome } from '@/features/apps/data/errors'

export type EntitlementAlert =
  | { kind: 'forbidden'; copy: ForbiddenCopy }
  | { kind: 'message'; text: string }

export type EntitlementField = 'app_key' | 'plan' | 'limits'

export type EntitlementFormError = {
  fields: Partial<Record<EntitlementField, string>>
  alert: EntitlementAlert | null
}

const message = (text: string): EntitlementAlert => ({ kind: 'message', text })

const REJECTED = 'The API rejected these values.'
const ORG_GONE = 'This organization no longer exists.'
const ENTITLEMENT_GONE = 'This entitlement no longer exists.'

function fallback(error: unknown): EntitlementAlert {
  if (isForbidden(error))
    return { kind: 'forbidden', copy: forbiddenCopy(error) }
  if (isApiError(error)) return message(error.message.slice(0, 200))
  return message('Something went wrong.')
}

// Small private copies of the apps helpers (those are private to apps).
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

/** The first field of each `body.<field>...` validation entry. */
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

function validationFields(
  error: unknown,
  allowed: readonly EntitlementField[]
): EntitlementFormError {
  const fields: EntitlementFormError['fields'] = {}
  for (const { field, msg } of bodyFields(error))
    if (allowed.includes(field as EntitlementField))
      fields[field as EntitlementField] ??= msg
  return {
    fields,
    alert: Object.keys(fields).length ? null : message(REJECTED),
  }
}

const GRANT_409: Record<string, string> = {
  admin_app: "The admin app can't be granted to an organization.",
  app_disabled: 'This app is disabled. Enable it before granting it.',
  org_mode_none: "This app doesn't use organizations.",
  entitlement_exists: 'This organization already has this app.',
}

/**
 * Maps a failed grant or edit to field errors and an alert, by status, code
 * and `details[].reason` (ADR 0004). Mapped cases use our own copy; a 422 shows
 * the (capped) validation message on its field. The first matching rule wins.
 */
export function entitlementFormError(
  error: unknown,
  mode: 'grant' | 'edit'
): EntitlementFormError {
  if (isUnknownOutcome(error))
    return {
      fields: {},
      alert: message(
        mode === 'grant'
          ? "We couldn't confirm whether the product was granted. Check the list before trying again."
          : "We couldn't confirm the change. Check the list; saving again is safe."
      ),
    }
  if (isApiError(error, 409) && mode === 'grant') {
    const text = GRANT_409[firstReason(error) ?? '']
    return text
      ? { fields: { app_key: text }, alert: null }
      : { fields: {}, alert: message('The API refused this grant.') }
  }
  if (isApiError(error, 404)) {
    if (mode === 'grant' && firstReason(error) === 'unknown_app')
      return { fields: { app_key: 'No app with this key.' }, alert: null }
    return {
      fields: {},
      alert: message(mode === 'grant' ? ORG_GONE : ENTITLEMENT_GONE),
    }
  }
  if (isApiError(error, 422) && error.code === 'validation_error')
    return validationFields(
      error,
      mode === 'grant' ? ['app_key', 'plan', 'limits'] : ['plan', 'limits']
    )
  return { fields: {}, alert: fallback(error) }
}

/** Maps a failed enable/disable to what the confirm dialog shows. */
export function entitlementToggleError(error: unknown): EntitlementAlert {
  if (isUnknownOutcome(error))
    return message(
      "We couldn't confirm the change. Check the list; saving again is safe."
    )
  if (isApiError(error, 404)) return message(ENTITLEMENT_GONE)
  return fallback(error)
}
