import { isApiError } from '@/api'
import { forbiddenCopy, isForbidden, type ForbiddenCopy } from '@/lib/forbidden'

type FormField = 'slug' | 'name' | 'description'

type OrganizationAlert =
  | { kind: 'forbidden'; copy: ForbiddenCopy }
  | { kind: 'message'; text: string }

export type OrganizationFormError = {
  fields: Partial<Record<FormField, string>>
  alert: OrganizationAlert | null
}

const FIELDS: readonly string[] = ['slug', 'name', 'description']
const NO_LONGER_EXISTS = 'This organization no longer exists.'

const message = (text: string): OrganizationAlert => ({ kind: 'message', text })

function fallback(error: unknown): OrganizationAlert {
  if (isForbidden(error))
    return { kind: 'forbidden', copy: forbiddenCopy(error) }
  if (isApiError(error, 404)) return message(NO_LONGER_EXISTS)
  if (isApiError(error)) return message(error.message.slice(0, 200))
  return message('Something went wrong.')
}

/**
 * Maps a failed create/update to field errors and an alert (by status and
 * code, ADR 0004). Server text is never shown for the slug conflict: it
 * echoes the slug.
 */
export function organizationFormError(
  error: unknown,
  mode: 'create' | 'edit'
): OrganizationFormError {
  if (mode === 'create' && isApiError(error, 409) && error.code === 'conflict')
    return {
      fields: { slug: 'An organization with this slug already exists.' },
      alert: null,
    }
  if (isApiError(error, 422) && error.code === 'validation_error') {
    const fields: OrganizationFormError['fields'] = {}
    if (Array.isArray(error.details)) {
      for (const d of error.details as {
        loc?: unknown
        msg?: unknown
      }[]) {
        const loc = Array.isArray(d?.loc) ? d.loc : []
        const field = loc[1]
        if (
          loc[0] === 'body' &&
          typeof field === 'string' &&
          FIELDS.includes(field) &&
          typeof d.msg === 'string'
        )
          fields[field as FormField] ??= d.msg.slice(0, 200)
      }
    }
    return {
      fields,
      alert: Object.keys(fields).length
        ? null
        : message('The API rejected these values.'),
    }
  }
  return { fields: {}, alert: fallback(error) }
}

/** Maps a failed `PATCH {status}` to what the dialog shows. */
export function organizationStatusError(error: unknown): OrganizationAlert {
  return fallback(error)
}

/** Maps a failed `DELETE` to what the dialog shows. */
export function organizationDeleteError(error: unknown): OrganizationAlert {
  if (isApiError(error, 409) && error.code === 'org_has_assignments')
    return message(
      'This organization still has role assignments. Revoke them first, then delete it.'
    )
  return fallback(error)
}
