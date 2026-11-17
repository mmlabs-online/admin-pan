import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import {
  entitlementFormError,
  entitlementToggleError,
} from './entitlement-errors'

const err = (status: number, code: string, details: unknown = null) =>
  new ApiError({
    kind: 'http',
    status,
    code,
    message: 'server text',
    details,
  })
const reason = (r: string) => [{ field: 'app_key', reason: r }]
const loc = (...l: string[]) => [{ loc: ['body', ...l], msg: 'bad value' }]
const network = new ApiError({
  kind: 'network',
  status: 0,
  code: 'network_error',
  message: 'offline',
})
const text = (e: ReturnType<typeof entitlementFormError>) =>
  e.alert?.kind === 'message' ? e.alert.text : undefined

describe('entitlementFormError (grant)', () => {
  it('409 admin_app / app_disabled / org_mode_none / entitlement_exists -> app field messages; unknown 409 reason -> alert; 404 unknown_app -> app field; 404 without reason -> org gone; 422 loc body.plan -> plan, body.limits.* -> limits, body.app_key -> app, other -> alert; 403 -> forbidden; network / timeout / 502 -> unknown-outcome text; other -> message (<= 200 chars)', () => {
    for (const r of [
      'admin_app',
      'app_disabled',
      'org_mode_none',
      'entitlement_exists',
    ]) {
      const mapped = entitlementFormError(
        err(409, 'conflict', reason(r)),
        'grant'
      )
      expect(Object.keys(mapped.fields), r).toEqual(['app_key'])
      expect(mapped.alert).toBeNull()
    }
    expect(
      text(entitlementFormError(err(409, 'conflict', reason('x')), 'grant'))
    ).toBe('The API refused this grant.')

    expect(
      entitlementFormError(
        err(404, 'not_found', reason('unknown_app')),
        'grant'
      ).fields
    ).toEqual({ app_key: 'No app with this key.' })
    expect(text(entitlementFormError(err(404, 'not_found'), 'grant'))).toBe(
      'This organization no longer exists.'
    )

    const invalid = (...l: string[]) =>
      entitlementFormError(err(422, 'validation_error', loc(...l)), 'grant')
    expect(Object.keys(invalid('plan').fields)).toEqual(['plan'])
    expect(Object.keys(invalid('limits', 'seats').fields)).toEqual(['limits'])
    expect(Object.keys(invalid('app_key').fields)).toEqual(['app_key'])
    expect(text(invalid('enabled'))).toBe('The API rejected these values.')

    expect(
      entitlementFormError(err(403, 'permission_denied'), 'grant').alert
    ).toMatchObject({ kind: 'forbidden' })
    for (const e of [network, err(502, 'bad_gateway')])
      expect(text(entitlementFormError(e, 'grant'))).toContain(
        "couldn't confirm whether the product was granted"
      )
    const long = new ApiError({
      kind: 'http',
      status: 400,
      code: 'x',
      message: 'm'.repeat(500),
    })
    expect(text(entitlementFormError(long, 'grant'))).toHaveLength(200)
  })
})

describe('entitlementFormError (edit) and entitlementToggleError', () => {
  it("404 -> 'This entitlement no longer exists.'; 422 mapping (edit); 403 -> forbidden; unknown outcome -> 'check the list; saving again is safe'", () => {
    expect(text(entitlementFormError(err(404, 'not_found'), 'edit'))).toBe(
      'This entitlement no longer exists.'
    )
    expect(entitlementToggleError(err(404, 'not_found'))).toEqual({
      kind: 'message',
      text: 'This entitlement no longer exists.',
    })
    expect(
      Object.keys(
        entitlementFormError(err(422, 'validation_error', loc('plan')), 'edit')
          .fields
      )
    ).toEqual(['plan'])
    expect(
      entitlementFormError(err(422, 'validation_error', loc('app_key')), 'edit')
        .alert
    ).toMatchObject({ kind: 'message' })
    expect(entitlementToggleError(err(403, 'permission_denied'))).toMatchObject(
      { kind: 'forbidden' }
    )
    expect(
      entitlementFormError(err(403, 'permission_denied'), 'edit').alert
    ).toMatchObject({ kind: 'forbidden' })
    expect(text(entitlementFormError(network, 'edit'))).toContain(
      'saving again is safe'
    )
    expect(entitlementToggleError(network)).toMatchObject({
      text: expect.stringContaining('saving again is safe'),
    })
  })
})
