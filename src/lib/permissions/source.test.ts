import { fakePermissionSource } from '@/test-utils/permissions'
import { describe, expect, it } from 'vitest'
import { ADMIN_PERMISSIONS, ACTIONS, type Requirement } from './registry'
import { evaluate, evaluateAll, unknownPermissionSource } from './source'

const denyAll = fakePermissionSource([])
const read = ACTIONS['users.view']
const write = ACTIONS['users.setStatus']
const none: Requirement = { kind: 'none', reason: 'test' }
const pending = ACTIONS['reports.create']

describe('permission source', () => {
  it('the production source answers unknown for every admin permission', () => {
    for (const key of ADMIN_PERMISSIONS)
      expect(unknownPermissionSource.check(key)).toBe('unknown')
  })

  it('evaluate: none is granted, pending is unknown even under a deny-all source', () => {
    expect(evaluate(none, denyAll)).toBe('granted')
    expect(evaluate(pending, denyAll)).toBe('unknown')
  })

  it('evaluate: permission returns what the source says (granted / denied / unknown)', () => {
    const source = fakePermissionSource(['admin:users:read'])
    expect(evaluate(read, source)).toBe('granted')
    expect(evaluate(write, source)).toBe('denied')
    expect(evaluate(read, unknownPermissionSource)).toBe('unknown')
  })

  it('evaluate many: denied only when every requirement is denied; granted if any is granted; otherwise unknown', () => {
    const source = fakePermissionSource(['admin:users:read'])
    expect(evaluateAll([read, write], source)).toBe('granted')
    expect(evaluateAll([write], source)).toBe('denied')
    expect(evaluateAll([write, pending], source)).toBe('unknown')
    expect(evaluateAll([read, write], unknownPermissionSource)).toBe('unknown')
  })
})
