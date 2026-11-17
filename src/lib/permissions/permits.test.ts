import { describe, expect, it } from 'vitest'
import { permits } from './permits'
import { ADMIN_PERMISSIONS } from './registry'

const set = (...k: string[]) => new Set(k)

describe('permits', () => {
  it('ADR-0003 table', () => {
    expect(permits(set('adm:*'), 'admin:x:y')).toBe(false)
    expect(permits(set('admin:*'), 'adm:x:y')).toBe(false)
    expect(permits(set('a:*'), 'a:')).toBe(false)
    expect(permits(set('a:*'), ':x:y')).toBe(false)
    expect(permits(set('A:*'), 'a:x:y')).toBe(false)
    expect(permits(set('a:x:read'), 'a:x:read')).toBe(true)
  })

  it('admin:* grants every ADMIN_PERMISSIONS key', () => {
    for (const p of ADMIN_PERMISSIONS)
      expect(permits(set('admin:*'), p)).toBe(true)
  })

  it('admin:users:*, bare *, stoktok:* and Admin:* grant no admin key', () => {
    for (const g of ['admin:users:*', '*', 'stoktok:*', 'Admin:*'])
      expect(permits(set(g), 'admin:users:read')).toBe(false)
  })

  it('malformed required (admin, admin:, :x) is false even with admin:*', () => {
    for (const r of ['admin', 'admin:', ':x', ''])
      expect(permits(set('admin:*', r), r)).toBe(false)
  })

  it('empty set denies; unrelated extra keys do not change the answer', () => {
    expect(permits(set(), 'admin:users:read')).toBe(false)
    expect(permits(set('admin:orgs:read', 'x:y'), 'admin:users:read')).toBe(
      false
    )
    expect(
      permits(set('admin:orgs:read', 'admin:users:read'), 'admin:users:read')
    ).toBe(true)
  })
})
