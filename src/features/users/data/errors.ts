import { isApiError } from '@/api'
import { forbiddenCopy, isForbidden, type ForbiddenCopy } from '@/lib/forbidden'

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
