import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import {
  organizationDeleteError,
  organizationFormError,
  organizationStatusError,
} from './errors'

const err = (status: number, code: string, details: unknown = null) =>
  new ApiError({
    kind: 'http',
    status,
    code,
    message: 'server text with slug acme',
    details,
  })

describe('organizationFormError', () => {
  it('409 conflict on create -> slug', () => {
    const r = organizationFormError(err(409, 'conflict'), 'create')
    expect(r.fields.slug).toBe('An organization with this slug already exists.')
    expect(r.alert).toBeNull()
  })

  it('409 on edit is not mapped to slug (alert)', () => {
    const r = organizationFormError(err(409, 'conflict'), 'edit')
    expect(r.fields).toEqual({})
    expect(r.alert?.kind).toBe('message')
  })

  it('422 validation_error maps body.slug/name/description; unmapped loc -> alert', () => {
    const mapped = organizationFormError(
      err(422, 'validation_error', [
        { type: 't', loc: ['body', 'slug'], msg: 'bad slug' },
        { type: 't', loc: ['body', 'name'], msg: 'bad name' },
      ]),
      'create'
    )
    expect(mapped.fields).toEqual({ slug: 'bad slug', name: 'bad name' })
    expect(mapped.alert).toBeNull()

    const unmapped = organizationFormError(
      err(422, 'validation_error', [
        { type: 't', loc: ['query', 'limit'], msg: 'x' },
      ]),
      'create'
    )
    expect(unmapped.fields).toEqual({})
    expect(unmapped.alert).toEqual({
      kind: 'message',
      text: 'The API rejected these values.',
    })
  })

  it("403 -> forbidden copy; 404 -> 'no longer exists'; other ApiError -> message <= 200; non-ApiError -> generic", () => {
    expect(
      organizationFormError(err(403, 'permission_denied'), 'edit').alert?.kind
    ).toBe('forbidden')
    expect(organizationFormError(err(404, 'not_found'), 'edit').alert).toEqual({
      kind: 'message',
      text: 'This organization no longer exists.',
    })
    const long = new ApiError({
      kind: 'http',
      status: 500,
      code: 'x',
      message: 'm'.repeat(500),
    })
    const other = organizationFormError(long, 'edit').alert
    expect(other?.kind === 'message' && other.text.length).toBe(200)
    expect(organizationFormError(new Error('boom'), 'edit').alert).toEqual({
      kind: 'message',
      text: 'Something went wrong.',
    })
  })
})

describe('organizationDeleteError', () => {
  it('409 org_has_assignments -> fixed text; 404; 403; other', () => {
    expect(organizationDeleteError(err(409, 'org_has_assignments'))).toEqual({
      kind: 'message',
      text: 'This organization still has role assignments. Revoke them first, then delete it.',
    })
    expect(organizationDeleteError(err(404, 'not_found'))).toEqual({
      kind: 'message',
      text: 'This organization no longer exists.',
    })
    expect(organizationDeleteError(err(403, 'permission_denied')).kind).toBe(
      'forbidden'
    )
    expect(organizationDeleteError(new Error('x'))).toEqual({
      kind: 'message',
      text: 'Something went wrong.',
    })
  })
})

describe('organizationStatusError', () => {
  it('403; 404; other', () => {
    expect(organizationStatusError(err(403, 'permission_denied')).kind).toBe(
      'forbidden'
    )
    expect(organizationStatusError(err(404, 'not_found'))).toEqual({
      kind: 'message',
      text: 'This organization no longer exists.',
    })
    expect(organizationStatusError(new Error('x'))).toEqual({
      kind: 'message',
      text: 'Something went wrong.',
    })
  })
})
