import { describe, expect, it } from 'vitest'
import {
  actionBadgeClass,
  actionOptions,
  targetLabels,
  targetTypeOptions,
} from './data'
import { auditLogSearchSchema } from './search'

describe('app_credential audit entries', () => {
  it('.issued/.revoked have non-neutral badge tones (success/warning), are listed in actionOptions; "App credential" is a target type; the search schema accepts them', () => {
    const neutral = actionBadgeClass('unknown.action')
    const issued = actionBadgeClass('app_credential.issued')
    const revoked = actionBadgeClass('app_credential.revoked')
    expect(issued).not.toBe(neutral)
    expect(revoked).not.toBe(neutral)
    expect(issued).toContain('teal')
    expect(revoked).toContain('amber')
    const values = actionOptions.map((o) => o.value)
    expect(values).toContain('app_credential.issued')
    expect(values).toContain('app_credential.revoked')
    expect(targetLabels.app_credential).toBe('App credential')
    expect(targetTypeOptions).toContainEqual({
      label: 'App credential',
      value: 'app_credential',
    })
    expect(
      auditLogSearchSchema.parse({
        action: 'app_credential.issued',
        targetType: 'app_credential',
      })
    ).toMatchObject({
      action: 'app_credential.issued',
      targetType: 'app_credential',
    })
  })
})

describe('entitlement audit entries', () => {
  it('granted/updated/revoked have non-neutral tones and are in actionOptions; "Entitlement" is a target type; the search schema accepts them', () => {
    const neutral = actionBadgeClass('unknown.action')
    const values = actionOptions.map((o) => o.value)
    for (const a of [
      'entitlement.granted',
      'entitlement.updated',
      'entitlement.revoked',
    ]) {
      expect(actionBadgeClass(a)).not.toBe(neutral)
      expect(values).toContain(a)
    }
    expect(targetLabels.entitlement).toBe('Entitlement')
    expect(targetTypeOptions).toContainEqual({
      label: 'Entitlement',
      value: 'entitlement',
    })
    expect(
      auditLogSearchSchema.parse({
        action: 'entitlement.granted',
        targetType: 'entitlement',
      })
    ).toMatchObject({
      action: 'entitlement.granted',
      targetType: 'entitlement',
    })
  })
})
