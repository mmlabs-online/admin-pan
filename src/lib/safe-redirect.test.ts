import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safe-redirect'

describe('safeRedirect', () => {
  it.each([
    ['//evil.com'],
    ['/\\evil.com'],
    ['/\t/evil.com'],
    ['/\n/evil.com'],
    ['/..//evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['evil'],
    [''],
    [undefined],
    [null],
    [42],
    ['/' + 'a'.repeat(2048)],
    ['/users\u0000'],
  ])('rejects %j -> "/"', (raw) => {
    expect(safeRedirect(raw)).toBe('/')
  })

  it('keeps pathname+search, drops hash', () => {
    expect(safeRedirect('/users?q=1#x')).toBe('/users?q=1')
    expect(safeRedirect('/organizations')).toBe('/organizations')
  })

  it.each([
    ['/sign-in?redirect=/x'],
    ['/sign-in'],
    ['/forgot-password'],
    ['/reset-password'],
    ['/verify-email'],
  ])('auth page %s falls back to "/"', (raw) => {
    expect(safeRedirect(raw)).toBe('/')
  })
})
