import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import {
  roleCreateError,
  roleDefaultError,
  roleDeleteError,
  rolePermissionsError,
  roleRenameError,
} from './errors'

const err = (status: number, code: string, details: unknown = null) =>
  new ApiError({
    kind: 'http',
    status,
    code,
    message: 'server text',
    details,
  })
const reason = (r: string, extra: object = {}) => [
  { field: 'x', reason: r, ...extra },
]
const network = new ApiError({
  kind: 'network',
  status: 0,
  code: 'network',
  message: 'offline',
})
const text = (a: { kind: string; text?: string } | null) =>
  a?.kind === 'message' ? a.text : undefined
const ctx = { appKey: 'stoktok' }

describe('roleCreateError', () => {
  it('409 -> key field; after an unknown outcome adds the may-have-been-created hint', () => {
    expect(roleCreateError(err(409, 'conflict'), ctx).fields.segment).toBe(
      'A role with this key already exists.'
    )
    expect(
      roleCreateError(err(409, 'conflict'), { ...ctx, afterUnknown: true })
        .fields.segment
    ).toContain('It may have just been created; check the list.')
  })

  it('422 prefix_mismatch -> key; validation_error body.key/body.name -> fields, else alert', () => {
    expect(
      roleCreateError(err(422, 'unprocessable', reason('prefix_mismatch')), ctx)
        .fields.segment
    ).toBe('The key must start with stoktok:')
    const v = roleCreateError(
      err(422, 'validation_error', [
        { type: 't', loc: ['body', 'key'], msg: 'bad key' },
        { type: 't', loc: ['body', 'name'], msg: 'bad name' },
      ]),
      ctx
    )
    expect(v.fields).toEqual({ segment: 'bad key', name: 'bad name' })
    expect(
      roleCreateError(err(422, 'validation_error', []), ctx).alert
    ).toEqual({ kind: 'message', text: 'The API rejected these values.' })
  })

  it('403 -> forbidden; 404 -> app gone; unknown outcome -> could-not-confirm alert', () => {
    expect(
      roleCreateError(err(403, 'admin_wildcard_required'), ctx).alert?.kind
    ).toBe('forbidden')
    expect(
      roleCreateError(err(403, 'permission_denied'), ctx).alert?.kind
    ).toBe('forbidden')
    expect(text(roleCreateError(err(404, 'not_found'), ctx).alert)).toBe(
      'This app no longer exists.'
    )
    expect(text(roleCreateError(network, ctx).alert)).toContain(
      "couldn't confirm"
    )
    expect(text(roleCreateError(err(500, 'internal'), ctx).alert)).toContain(
      "couldn't confirm"
    )
  })
})

describe('roleRenameError', () => {
  it('422 validation body.name -> name; 403 -> forbidden; 404 -> role gone; 409 -> changed; other -> message', () => {
    expect(
      roleRenameError(
        err(422, 'validation_error', [
          { type: 't', loc: ['body', 'name'], msg: 'too long' },
        ])
      ).fields.name
    ).toBe('too long')
    expect(
      roleRenameError(err(403, 'admin_wildcard_required')).alert?.kind
    ).toBe('forbidden')
    expect(text(roleRenameError(err(404, 'not_found')).alert)).toBe(
      'This role no longer exists.'
    )
    expect(text(roleRenameError(err(409, 'conflict')).alert)).toContain(
      'changed by someone else'
    )
    expect(text(roleRenameError(err(400, 'x')).alert)).toBe('server text')
  })
})

describe('rolePermissionsError', () => {
  it('409 role_has_assignments (code or reason) -> revoke-first text', () => {
    for (const e of [
      err(409, 'role_has_assignments'),
      err(409, 'conflict', reason('role_has_assignments')),
    ])
      expect(text(rolePermissionsError(e))).toContain('Revoke its assignments')
  })

  it('409 conflict -> fixed lead plus the API message, cut to 200', () => {
    const long = new ApiError({
      kind: 'http',
      status: 409,
      code: 'conflict',
      message: 'z'.repeat(300),
      details: null,
    })
    const t = text(rolePermissionsError(long)) ?? ''
    expect(t).toContain('The API refused this permission set')
    expect(t.endsWith('z'.repeat(200))).toBe(true)
  })

  it('422 unknown_permission names details[].key (at most 10); wildcard_super_admin_only; validation_error', () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => reason('unknown_permission', { key: `a:k${i}` })[0]
    )
    const t = text(rolePermissionsError(err(422, 'unprocessable', many))) ?? ''
    expect(t).toContain('a:k0')
    expect(t).toContain('a:k9')
    expect(t).not.toContain('a:k10')
    expect(
      text(
        rolePermissionsError(
          err(422, 'unprocessable', reason('wildcard_super_admin_only'))
        )
      )
    ).toBe('Only the admin:super-admin role can hold admin:*.')
    expect(text(rolePermissionsError(err(422, 'validation_error', [])))).toBe(
      'The API rejected these values.'
    )
  })

  it('403 -> forbidden; 404 -> role gone', () => {
    expect(rolePermissionsError(err(403, 'admin_wildcard_required')).kind).toBe(
      'forbidden'
    )
    expect(text(rolePermissionsError(err(404, 'not_found')))).toBe(
      'This role no longer exists.'
    )
  })
})

describe('roleDeleteError', () => {
  it('any 409 -> fixed reason plus API message; 404 -> role gone; 403 -> forbidden; unknown outcome -> check the list', () => {
    expect(text(roleDeleteError(err(409, 'conflict')))).toContain(
      "This role can't be deleted"
    )
    expect(text(roleDeleteError(err(409, 'conflict')))).toContain('server text')
    expect(text(roleDeleteError(err(404, 'not_found')))).toBe(
      'This role no longer exists.'
    )
    expect(roleDeleteError(err(403, 'permission_denied')).kind).toBe(
      'forbidden'
    )
    expect(text(roleDeleteError(network))).toBe(
      "We couldn't confirm the delete. Check the list."
    )
  })
})

describe('roleDefaultError', () => {
  it('422 reasons -> fixed copy each; other 422 -> rejected', () => {
    const copies = new Set<string | undefined>()
    for (const r of [
      'role_has_admin_permissions',
      'role_has_org_permissions',
      'unknown_role',
      'same_as_default_role',
    ])
      copies.add(
        text(roleDefaultError(err(422, 'unprocessable', reason(r)), 'stoktok'))
      )
    expect(copies.size).toBe(4)
    expect(
      text(roleDefaultError(err(422, 'unprocessable', reason('zzz')), 'x'))
    ).toBe('The API rejected these values.')
  })

  it('409 on admin -> no default role; 409 other -> changed; 403; 404 -> app gone', () => {
    expect(text(roleDefaultError(err(409, 'conflict'), 'admin'))).toBe(
      "The admin app can't have a default role."
    )
    expect(text(roleDefaultError(err(409, 'conflict'), 'stoktok'))).toContain(
      'changed by someone else'
    )
    expect(roleDefaultError(err(403, 'permission_denied'), 'x').kind).toBe(
      'forbidden'
    )
    expect(text(roleDefaultError(err(404, 'not_found'), 'x'))).toBe(
      'This app no longer exists.'
    )
  })
})
