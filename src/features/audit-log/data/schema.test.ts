import { describe, expect, it } from 'vitest'
import { auditLogSearchSchema } from './search'

const ID = '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01'

describe('auditLogSearchSchema', () => {
  it('keeps valid single values and drops invalid ones', () => {
    expect(
      auditLogSearchSchema.parse({
        action: 'user.disabled',
        targetType: 'user',
        actorKind: 'system',
        outcome: 'denied',
        actor: ID,
        target: ID,
        from: '2026-11-01',
        to: '2026-11-02',
      })
    ).toMatchObject({
      action: 'user.disabled',
      targetType: 'user',
      actorKind: 'system',
      outcome: 'denied',
      actor: ID,
      target: ID,
      from: '2026-11-01',
      to: '2026-11-02',
    })
    const bad = auditLogSearchSchema.parse({
      targetType: 'session',
      action: ['user.disable'],
      actor: 'not-a-uuid',
      from: '01/11/2026',
    })
    expect(bad.targetType).toBeUndefined()
    expect(bad.action).toBeUndefined()
    expect(bad.actor).toBeUndefined()
    expect(bad.from).toBeUndefined()
  })

  it('drops unknown keys (no email key survives)', () => {
    const parsed = auditLogSearchSchema.parse({
      email: 'alice@example.com',
      q: 'alice@example.com',
    })
    expect(Object.keys(parsed)).not.toContain('email')
    expect(JSON.stringify(parsed)).not.toContain('@')
  })

  it('app must match the app-key pattern', () => {
    expect(auditLogSearchSchema.parse({ app: 'admin' }).app).toBe('admin')
    expect(auditLogSearchSchema.parse({ app: 'Admin' }).app).toBeUndefined()
    expect(auditLogSearchSchema.parse({ app: 'a' }).app).toBeUndefined()
    expect(auditLogSearchSchema.parse({ app: 'a@b.com' }).app).toBeUndefined()
  })
})
