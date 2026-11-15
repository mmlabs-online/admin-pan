import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import { passwordErrorsFrom } from './password-errors'

const e422 = (code: string, details: unknown) =>
  new ApiError({ kind: 'http', status: 422, code, message: 'x', details })

describe('passwordErrorsFrom', () => {
  it('weak_password too_short/too_common -> field errors', () => {
    const r = passwordErrorsFrom(
      e422('weak_password', { reasons: ['too_short', 'too_common'] })
    )
    expect(r?.fields.new_password).toBe(
      'Password is too short. Password is too common.'
    )
  })

  it('validation_error maps loc to field; unknown -> form error; never echoes msg', () => {
    const a = passwordErrorsFrom(
      e422('validation_error', [
        { loc: ['body', 'new_password'], msg: 'secret-pw', input: 'secret-pw' },
      ])
    )
    expect(a?.fields.new_password).toBe('Password is not valid.')
    expect(JSON.stringify(a)).not.toContain('secret-pw')
    const b = passwordErrorsFrom(
      e422('validation_error', [{ loc: ['body', 'token'], msg: 'm' }])
    )
    expect(b?.form).toBeTruthy()
  })

  it('returns null for other errors', () => {
    expect(passwordErrorsFrom(e422('token_invalid', null))).toBeNull()
    expect(passwordErrorsFrom(new Error('x'))).toBeNull()
  })
})
