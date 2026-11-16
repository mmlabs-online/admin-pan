import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import { statusChangeError } from './errors'

const err = (status: number, code: string, message = 'server text') =>
  new ApiError({ kind: 'http', status, code, message })

describe('statusChangeError', () => {
  it('maps 403 codes to forbidden copy without the server message', () => {
    for (const code of [
      'self_status_change_forbidden',
      'admin_wildcard_required',
      'permission_denied',
    ]) {
      const r = statusChangeError(err(403, code))
      expect(r.kind).toBe('forbidden')
      expect(JSON.stringify(r)).not.toContain('server text')
    }
  })
  it('maps 409 last_super_admin, 404 and other errors', () => {
    expect(statusChangeError(err(409, 'last_super_admin'))).toEqual({
      kind: 'message',
      text: "You can't disable the last active super admin.",
    })
    expect(statusChangeError(err(404, 'not_found'))).toEqual({
      kind: 'message',
      text: 'This user no longer exists.',
    })
    expect(
      statusChangeError(err(422, 'validation_error', 'x'.repeat(300)))
    ).toEqual({ kind: 'message', text: 'x'.repeat(200) })
    expect(statusChangeError(new Error('boom'))).toEqual({
      kind: 'message',
      text: 'Something went wrong.',
    })
  })
})
