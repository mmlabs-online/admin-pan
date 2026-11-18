import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import { sessionRevokeError, statusChangeError } from './errors'

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

describe('sessionRevokeError', () => {
  it('404 -> gone; 403 -> forbidden copy (self code mapped); unknown outcomes and other errors -> fixed copy, never the server message', () => {
    expect(sessionRevokeError(err(404, 'not_found'))).toEqual({ kind: 'gone' })
    for (const code of [
      'permission_denied',
      'admin_wildcard_required',
      'self_session_change_forbidden',
    ]) {
      const r = sessionRevokeError(err(403, code))
      expect(r.kind).toBe('forbidden')
      expect(JSON.stringify(r)).not.toContain('server text')
    }
    expect(
      sessionRevokeError(err(403, 'self_session_change_forbidden'))
    ).toMatchObject({
      copy: { title: "You can't manage your own sessions" },
    })
    const unknown = {
      kind: 'message',
      text: "We couldn't confirm the revoke. Check the list; revoking again is safe.",
    }
    expect(sessionRevokeError(err(500, 'internal_error'))).toEqual(unknown)
    expect(
      sessionRevokeError(
        new ApiError({ kind: 'network', status: 0, code: '', message: 'x' })
      )
    ).toEqual(unknown)
    expect(
      sessionRevokeError(
        new ApiError({ kind: 'timeout', status: 0, code: '', message: 'x' })
      )
    ).toEqual(unknown)
    expect(
      sessionRevokeError(
        new ApiError({
          kind: 'invalid_response',
          status: 200,
          code: '',
          message: 'x',
        })
      )
    ).toEqual(unknown)
    const other = sessionRevokeError(err(422, 'validation_error'))
    expect(other).toEqual({
      kind: 'message',
      text: 'The API refused this revoke. Refresh the list and try again.',
    })
    expect(sessionRevokeError(new Error('boom'))).toEqual(other)
  })
})
