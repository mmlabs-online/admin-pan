import { z } from 'zod'
import { isApiError } from '@/api'

export type PasswordFormErrors = {
  fields: Partial<Record<'new_password' | 'confirm', string>>
  form?: string
}

const weak = z.object({
  reasons: z.array(z.enum(['too_short', 'too_common'])),
})

const REASON_TEXT = {
  too_short: 'Password is too short.',
  too_common: 'Password is too common.',
}

/**
 * Maps a 422 to fixed field/form texts. API `msg`/`input` are never echoed (R5):
 * they can contain the submitted password.
 */
export function passwordErrorsFrom(e: unknown): PasswordFormErrors | null {
  if (!isApiError(e, 422)) return null
  if (e.code === 'weak_password') {
    const parsed = weak.safeParse(e.details)
    const reasons = parsed.success ? parsed.data.reasons : []
    return {
      fields: {
        new_password: reasons.length
          ? reasons.map((r) => REASON_TEXT[r]).join(' ')
          : 'Password is too weak.',
      },
    }
  }
  if (e.code === 'validation_error') {
    const items = Array.isArray(e.details) ? e.details : []
    const loc: unknown = items[0]?.loc?.at?.(-1)
    if (loc === 'new_password') {
      return { fields: { new_password: 'Password is not valid.' } }
    }
    return { fields: {}, form: 'The request was not valid.' }
  }
  return null
}
