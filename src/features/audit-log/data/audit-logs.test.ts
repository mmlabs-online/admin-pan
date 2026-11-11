import { describe, expect, it } from 'vitest'
import { auditLogs } from './audit-logs'

describe('audit log mock data', () => {
  it('has ~400 entries within the last 30 days, newest first', () => {
    expect(auditLogs).toHaveLength(400)
    const times = auditLogs.map((e) => Date.parse(e.occurred_at))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(Date.now() - times[times.length - 1]).toBeLessThanOrEqual(
      30 * 24 * 60 * 60 * 1000 + 60_000
    )
  })

  it('never shows a full email for unknown-account login failures', () => {
    const unknown = auditLogs.filter(
      (e) => e.action === 'auth.login.failure' && e.actor_user_id === null
    )
    expect(unknown.length).toBeGreaterThan(0)
    for (const e of unknown) expect(e.actor_email).toMatch(/^.\*\*\*@/)
  })

  it('contains no password or token fields', () => {
    expect(JSON.stringify(auditLogs)).not.toMatch(/password|token|secret/i)
  })
})
