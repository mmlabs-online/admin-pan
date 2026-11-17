import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import {
  appFormError,
  appStatusError,
  credentialIssueError,
  credentialRevokeError,
  isUnknownOutcome,
  permissionAdminError,
  permissionFormError,
} from './errors'

const err = (status: number, code: string, details: unknown = null) =>
  new ApiError({
    kind: 'http',
    status,
    code,
    message: 'server text',
    details,
  })
const reason = (r: string) => [{ field: 'x', reason: r }]
const create = { mode: 'create' } as const
const edit = (appKey = 'stoktok') => ({ mode: 'edit', appKey }) as const

describe('appFormError', () => {
  it('409 conflict, details null, create -> key; 409 origin_taken -> origins; 409 conflict on edit of admin -> admin rule alert; other edit 409 -> changed-meanwhile alert', () => {
    expect(appFormError(err(409, 'conflict'), create)).toEqual({
      fields: { key: 'An app with this key already exists.' },
      alert: null,
    })
    const taken = appFormError(
      err(409, 'conflict', [{ field: 'origins', reason: 'origin_taken' }]),
      create
    )
    expect(Object.keys(taken.fields)).toEqual(['origins'])
    expect(appFormError(err(409, 'conflict'), edit('admin')).alert).toEqual({
      kind: 'message',
      text: 'The admin app must stay active, closed, with org mode None and no default role.',
    })
    expect(appFormError(err(409, 'conflict'), edit()).alert).toMatchObject({
      text: expect.stringContaining('changed by someone else'),
    })
  })

  it('422 unprocessable apex_not_allowed / too_many_origins / loopback_not_allowed -> origins; role_has_org_permissions / org_mode_required -> org_mode; unknown reason -> alert', () => {
    for (const r of [
      'apex_not_allowed',
      'too_many_origins',
      'loopback_not_allowed',
    ])
      expect(
        Object.keys(
          appFormError(err(422, 'unprocessable', reason(r)), edit('admin'))
            .fields
        )
      ).toEqual(['origins'])
    for (const r of ['role_has_org_permissions', 'org_mode_required'])
      expect(
        Object.keys(
          appFormError(err(422, 'unprocessable', reason(r)), edit()).fields
        )
      ).toEqual(['org_mode'])
    expect(
      appFormError(err(422, 'unprocessable', reason('nope')), edit())
    ).toEqual({
      fields: {},
      alert: { kind: 'message', text: 'The API rejected these values.' },
    })
  })

  it('422 validation_error maps body.key/name/join_policy/org_mode/origins(.n); unmapped -> alert', () => {
    const mapped = appFormError(
      err(422, 'validation_error', [
        { type: 't', loc: ['body', 'key'], msg: 'bad key' },
        { type: 't', loc: ['body', 'name'], msg: 'bad name' },
        { type: 't', loc: ['body', 'join_policy'], msg: 'bad jp' },
        { type: 't', loc: ['body', 'org_mode'], msg: 'bad om' },
        { type: 't', loc: ['body', 'origins', 2], msg: 'bad origin' },
      ]),
      create
    )
    expect(mapped.fields).toEqual({
      key: 'bad key',
      name: 'bad name',
      join_policy: 'bad jp',
      org_mode: 'bad om',
      origins: 'bad origin',
    })
    expect(mapped.alert).toBeNull()
    expect(
      appFormError(
        err(422, 'validation_error', [{ loc: ['query', 'x'], msg: 'm' }]),
        create
      ).alert
    ).toMatchObject({ kind: 'message' })
  })

  it('403 permission_denied and admin_wildcard_required -> forbidden alert; 404 -> "This app no longer exists."; other ApiError -> message <= 200; non-ApiError -> generic', () => {
    for (const code of ['permission_denied', 'admin_wildcard_required'])
      expect(appFormError(err(403, code), edit()).alert?.kind).toBe('forbidden')
    expect(appFormError(err(404, 'not_found'), edit()).alert).toEqual({
      kind: 'message',
      text: 'This app no longer exists.',
    })
    const long = new ApiError({
      kind: 'http',
      status: 500,
      code: 'x',
      message: 'm'.repeat(300),
    })
    const alert = appFormError(long, edit()).alert
    expect(alert?.kind === 'message' && alert.text).toHaveLength(200)
    expect(appFormError(new Error('boom'), edit()).alert).toEqual({
      kind: 'message',
      text: 'Something went wrong.',
    })
  })
})

describe('appStatusError', () => {
  it("409 on 'admin' -> 'The admin app must stay active.'; other 409; 403; 404; other", () => {
    expect(appStatusError(err(409, 'conflict'), 'admin')).toEqual({
      kind: 'message',
      text: 'The admin app must stay active.',
    })
    expect(appStatusError(err(409, 'conflict'), 'stoktok')).toMatchObject({
      text: expect.stringContaining('changed by someone else'),
    })
    expect(appStatusError(err(403, 'permission_denied'), 'x').kind).toBe(
      'forbidden'
    )
    expect(appStatusError(err(404, 'not_found'), 'x')).toMatchObject({
      text: 'This app no longer exists.',
    })
    expect(appStatusError(err(500, 'x'), 'x')).toMatchObject({
      text: 'server text',
    })
  })
})

describe('permissionFormError', () => {
  it('409 -> action field; 422 validation body.key -> action, body.description -> description; 422 unprocessable reasons -> alert; 403; 404', () => {
    expect(permissionFormError(err(409, 'conflict')).fields.action).toBe(
      'A permission with this key already exists.'
    )
    expect(
      permissionFormError(
        err(422, 'validation_error', [
          { loc: ['body', 'key'], msg: 'bad key' },
          { loc: ['body', 'description'], msg: 'too long' },
        ])
      ).fields
    ).toEqual({ action: 'bad key', description: 'too long' })
    for (const [r, text] of [
      ['prefix_mismatch', 'The key must start with the app key.'],
      [
        'admin_app_permission_must_be_admin',
        'This permission must be admin only.',
      ],
      ['wildcard_must_be_admin', 'This permission must be admin only.'],
      ['reserved_scope', 'This key has a fixed scope.'],
      ['other', 'The API rejected these values.'],
    ])
      expect(
        permissionFormError(err(422, 'unprocessable', reason(r))).alert
      ).toEqual({ kind: 'message', text })
    expect(
      permissionFormError(err(403, 'admin_wildcard_required')).alert?.kind
    ).toBe('forbidden')
    expect(permissionFormError(err(404, 'not_found')).alert).toMatchObject({
      text: 'This app no longer exists.',
    })
  })
})

describe('permissionAdminError', () => {
  it("409 role_has_assignments -> revoke-first text; 409 conflict -> 'default or org owner role holds it' text; 422 -> 'always admin only'; 403; 404", () => {
    expect(
      permissionAdminError(
        err(409, 'role_has_assignments', [
          { field: 'is_admin', reason: 'role_has_assignments' },
        ])
      )
    ).toMatchObject({ text: expect.stringContaining('Revoke them first') })
    expect(permissionAdminError(err(409, 'conflict'))).toMatchObject({
      text: expect.stringContaining('default role or org owner role'),
    })
    for (const r of [
      'wildcard_must_be_admin',
      'admin_app_permission_must_be_admin',
    ])
      expect(
        permissionAdminError(err(422, 'unprocessable', reason(r)))
      ).toEqual({
        kind: 'message',
        text: 'This permission is always admin only.',
      })
    expect(permissionAdminError(err(403, 'permission_denied')).kind).toBe(
      'forbidden'
    )
    expect(permissionAdminError(err(404, 'not_found'))).toEqual({
      kind: 'message',
      text: 'This permission no longer exists.',
    })
  })
})

const apiErr = (kind: ApiError['kind'], status: number, code = 'x') =>
  new ApiError({ kind, status, code, message: 'server text' })

describe('isUnknownOutcome', () => {
  it('true for kinds network, timeout, aborted, invalid_response and http >= 500; false for 4xx, auth, config', () => {
    for (const kind of [
      'network',
      'timeout',
      'aborted',
      'invalid_response',
    ] as const)
      expect(isUnknownOutcome(apiErr(kind, 0))).toBe(true)
    expect(isUnknownOutcome(apiErr('http', 500))).toBe(true)
    expect(isUnknownOutcome(apiErr('http', 502))).toBe(true)
    expect(isUnknownOutcome(apiErr('http', 409))).toBe(false)
    expect(isUnknownOutcome(apiErr('http', 403))).toBe(false)
    expect(isUnknownOutcome(apiErr('auth', 401))).toBe(false)
    expect(isUnknownOutcome(apiErr('config', 0))).toBe(false)
    expect(isUnknownOutcome(new Error('x'))).toBe(false)
  })
})

describe('credentialIssueError', () => {
  it('409 admin_app / app_disabled / credential_limit / other 409 / 404 / 403 -> forbidden / unknown outcome text / other -> fallback', () => {
    const text = (e: unknown) => {
      const a = credentialIssueError(e)
      return a.kind === 'message' ? a.text : a.kind
    }
    expect(text(err(409, 'conflict', reason('admin_app')))).toBe(
      'The admin app has no credentials.'
    )
    expect(text(err(409, 'conflict', reason('app_disabled')))).toContain(
      'disabled'
    )
    expect(text(err(409, 'conflict', reason('credential_limit')))).toContain(
      '2 active credentials'
    )
    expect(text(err(409, 'conflict'))).toContain('refused')
    expect(text(err(404, 'not_found'))).toBe('This app no longer exists.')
    expect(text(err(403, 'permission_denied'))).toBe('forbidden')
    const wildcard = credentialIssueError(err(403, 'admin_wildcard_required'))
    expect(wildcard).toMatchObject({
      kind: 'forbidden',
      copy: { title: 'Only super admins can do this' },
    })
    for (const e of [
      apiErr('network', 0),
      apiErr('timeout', 0),
      apiErr('http', 502),
      apiErr('invalid_response', 0),
    ])
      expect(text(e)).toContain("couldn't confirm whether")
    expect(text(err(422, 'validation_error'))).toBe('server text')
    expect(text(new Error('x'))).toBe('Something went wrong.')
  })
})

describe('credentialRevokeError', () => {
  it("404 -> 'This credential no longer exists.'; 403 -> forbidden; unknown outcome -> 'revoking again is safe'; other -> fallback", () => {
    expect(credentialRevokeError(err(404, 'not_found'))).toEqual({
      kind: 'message',
      text: 'This credential no longer exists.',
    })
    expect(credentialRevokeError(err(403, 'permission_denied')).kind).toBe(
      'forbidden'
    )
    expect(credentialRevokeError(apiErr('network', 0))).toMatchObject({
      text: expect.stringContaining('revoking again is safe'),
    })
    expect(credentialRevokeError(err(422, 'validation_error'))).toEqual({
      kind: 'message',
      text: 'server text',
    })
  })
})
