import { describe, expect, it } from 'vitest'
import raw from '@/api/openapi.json?raw'
import {
  ACTIONS,
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_PATTERN,
  ROUTE_PERMISSIONS,
  type Requirement,
} from './registry'

type Spec = {
  paths: Record<string, Record<string, { 'x-permission'?: string }>>
}
const spec = JSON.parse(raw) as Spec

const declared: [string, Requirement][] = [
  ...Object.entries(ROUTE_PERMISSIONS),
  ...Object.entries(ACTIONS),
]

describe('permission registry', () => {
  it('ADMIN_PERMISSIONS equals the set of x-permission values in openapi.json', () => {
    const inSpec = new Set<string>()
    for (const ops of Object.values(spec.paths))
      for (const op of Object.values(ops))
        if (op['x-permission']) inSpec.add(op['x-permission'])
    expect([...ADMIN_PERMISSIONS].sort()).toEqual([...inSpec].sort())
  })

  it('every permission requirement matches the x-permission of each operation it names', () => {
    for (const [id, req] of declared) {
      if (req.kind !== 'permission') continue
      expect(req.operations.length, id).toBeGreaterThan(0)
      for (const operation of req.operations) {
        const [method, path] = operation.split(' ')
        const op = spec.paths[path]?.[method.toLowerCase()]
        expect(op, `${id}: ${operation}`).toBeDefined()
        expect(op['x-permission'], `${id}: ${operation}`).toBe(req.permission)
      }
    }
  })

  it('every key matches the API key pattern', () => {
    for (const key of ADMIN_PERMISSIONS)
      expect(key).toMatch(ADMIN_PERMISSION_PATTERN)
  })

  it('pending requirements name a PAN ticket and carry no permission', () => {
    const pending = declared.filter(([, r]) => r.kind === 'pending')
    expect(pending.length).toBeGreaterThan(0)
    for (const [id, req] of pending) {
      expect(req, id).not.toHaveProperty('permission')
      expect(req, id).toMatchObject({
        ticket: expect.stringMatching(/^PAN-\d+/),
      })
    }
  })
})
