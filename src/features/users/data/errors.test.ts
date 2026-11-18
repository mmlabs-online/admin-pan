import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import {
  assignRoleError,
  revokeAssignmentError,
  sessionRevokeError,
  statusChangeError,
} from './errors'

const err = (
  status: number,
  code: string,
  message = 'server text',
  details: unknown = null
) => new ApiError({ kind: 'http', status, code, message, details })
const unprocessable = (reason: string) =>
  err(422, 'unprocessable', 'server text', [{ field: 'x', reason }])
const net = () =>
  new ApiError({ kind: 'network', status: 0, code: 'network', message: 'down' })

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

describe('assignRoleError', () => {
  it('maps every 403 to forbidden copy, never the server text', () => {
    for (const code of [
      'admin_wildcard_required',
      'self_assignment_forbidden',
      'permission_denied',
    ]) {
      const r = assignRoleError(err(403, code))
      expect(r.alert?.kind).toBe('forbidden')
      expect(JSON.stringify(r)).not.toContain('server text')
    }
    expect(assignRoleError(err(403, 'admin_wildcard_required'))).toMatchObject({
      alert: { copy: { title: 'Only super admins can do this' } },
    })
  })

  it('409 conflict is an alert', () => {
    expect(assignRoleError(err(409, 'conflict')).alert).toEqual({
      kind: 'message',
      text: 'This user already has this role in this scope, or it changed at the same time. The list was refreshed.',
    })
  })

  it('422 unprocessable reasons map to fields; an unknown reason is an alert', () => {
    const field = (reason: string) =>
      Object.keys(assignRoleError(unprocessable(reason)).fields)
    expect(field('org_id_not_allowed')).toEqual(['org'])
    expect(field('unknown_org')).toEqual(['org'])
    expect(field('expires_in_past')).toEqual(['expires_at'])
    expect(field('expiry_not_allowed')).toEqual(['expires_at'])
    expect(field('unknown_role')).toEqual(['role'])
    expect(assignRoleError(unprocessable('whatever'))).toEqual({
      fields: {},
      alert: { kind: 'message', text: 'The API rejected these values.' },
    })
  })

  it('422 with the reason as the top-level code and no details does not map to a field', () => {
    const r = assignRoleError(err(422, 'expires_in_past'))
    expect(r.fields).toEqual({})
    expect(r.alert?.kind).toBe('message')
  })

  it('422 validation_error maps body.expires_at / org_id / role_id; else REJECTED', () => {
    const v = (field: string) =>
      err(422, 'validation_error', 'server text', [
        { loc: ['body', field], msg: 'bad value' },
      ])
    expect(assignRoleError(v('expires_at')).fields).toEqual({
      expires_at: 'bad value',
    })
    expect(assignRoleError(v('org_id')).fields).toEqual({ org: 'bad value' })
    expect(assignRoleError(v('role_id')).fields).toEqual({ role: 'bad value' })
    expect(assignRoleError(v('other')).alert).toEqual({
      kind: 'message',
      text: 'The API rejected these values.',
    })
  })

  it('404, unknown outcome and other errors use fixed copy', () => {
    expect(assignRoleError(err(404, 'not_found')).alert).toEqual({
      kind: 'message',
      text: 'This user no longer exists.',
    })
    expect(assignRoleError(net()).alert).toEqual({
      kind: 'message',
      text: "We couldn't confirm whether the role was granted. Check the list before trying again.",
    })
    expect(assignRoleError(err(400, 'bad')).alert).toEqual({
      kind: 'message',
      text: 'Something went wrong. Try again.',
    })
    expect(
      JSON.stringify(assignRoleError(err(404, 'not_found')))
    ).not.toContain('server text')
  })
})

describe('revokeAssignmentError', () => {
  it('404 is gone; 403 codes are forbidden', () => {
    expect(revokeAssignmentError(err(404, 'not_found'))).toEqual({
      kind: 'gone',
    })
    for (const code of ['admin_wildcard_required', 'self_assignment_forbidden'])
      expect(revokeAssignmentError(err(403, code)).kind).toBe('forbidden')
  })

  it('409 last_super_admin and 409 conflict have their own copy', () => {
    expect(revokeAssignmentError(err(409, 'last_super_admin'))).toEqual({
      kind: 'message',
      text: 'This is the last active super admin. Grant admin:super-admin to someone else first.',
    })
    expect(revokeAssignmentError(err(409, 'conflict'))).toEqual({
      kind: 'message',
      text: 'This assignment changed at the same time. The list was refreshed; try again.',
    })
  })

  it('unknown outcome says it may have been applied; others are fixed copy', () => {
    expect(revokeAssignmentError(net())).toMatchObject({
      text: expect.stringContaining('it may have been applied') as string,
    })
    const other = revokeAssignmentError(err(500, 'boom'))
    expect(JSON.stringify(other)).not.toContain('server text')
  })
})
