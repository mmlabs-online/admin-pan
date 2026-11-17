import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import { forbiddenCopy, isForbidden, routeForbiddenCopy } from './forbidden'

const err = (
  code: string,
  details: unknown = null,
  over: Partial<ConstructorParameters<typeof ApiError>[0]> = {}
) =>
  new ApiError({
    kind: 'http',
    status: 403,
    code,
    message: 'secret text',
    details,
    ...over,
  })

describe('forbidden copy', () => {
  it('copy is chosen by code for permission_denied, admin_wildcard_required, self_assignment_forbidden, self_status_change_forbidden and unknown 403 codes', () => {
    expect(forbiddenCopy(err('permission_denied')).title).toBe(
      "You don't have permission to do this"
    )
    expect(forbiddenCopy(err('admin_wildcard_required')).title).toBe(
      'Only super admins can do this'
    )
    expect(forbiddenCopy(err('self_assignment_forbidden')).title).toBe(
      "You can't change your own roles"
    )
    expect(forbiddenCopy(err('self_status_change_forbidden')).title).toBe(
      "You can't change your own account status"
    )
    expect(forbiddenCopy(err('self_session_change_forbidden')).title).toBe(
      "You can't manage your own sessions"
    )
    expect(forbiddenCopy(err('something_else')).description).toBe(
      'The server refused this request.'
    )
  })

  it('required is shown only when it matches the key pattern', () => {
    const copy = (required: unknown) =>
      forbiddenCopy(err('permission_denied', { required }))
    expect(copy('admin:users:write').required).toBe('admin:users:write')
    expect(copy('<img src=x>').required).toBeUndefined()
    expect(copy(42).required).toBeUndefined()
    expect(forbiddenCopy(err('permission_denied')).required).toBeUndefined()
  })

  it('never uses the server message', () => {
    for (const code of [
      'permission_denied',
      'admin_wildcard_required',
      'self_assignment_forbidden',
      'self_status_change_forbidden',
      'self_session_change_forbidden',
      'other',
    ])
      expect(JSON.stringify(forbiddenCopy(err(code)))).not.toContain(
        'secret text'
      )
  })

  it('isForbidden is false for kind auth 403, 401 and 404', () => {
    expect(isForbidden(err('permission_denied'))).toBe(true)
    expect(isForbidden(err('not_member', null, { kind: 'auth' }))).toBe(false)
    expect(isForbidden(err('x', null, { status: 401 }))).toBe(false)
    expect(isForbidden(err('x', null, { status: 404 }))).toBe(false)
    expect(isForbidden(new Error('x'))).toBe(false)
  })

  it('routeForbiddenCopy names the permission', () => {
    expect(routeForbiddenCopy('admin:apps:read').required).toBe(
      'admin:apps:read'
    )
  })
})
