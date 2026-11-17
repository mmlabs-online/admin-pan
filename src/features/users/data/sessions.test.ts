import { describe, expect, it } from 'vitest'
import {
  REVOKE_ALL_EFFECT,
  REVOKE_ONE_EFFECT,
  SESSIONS_NOTE,
  sanitizeUserAgent,
} from './sessions'

describe('sanitizeUserAgent', () => {
  it('removes C0/C1 controls and bidi controls (U+202A–202E, U+2066–2069, U+200E, U+200F, U+061C) and trims', () => {
    const bidi = '‪‫‬‭‮⁦⁧⁨⁩‎‏؜'
    expect(sanitizeUserAgent(`  Mozilla${bidi}/5.0  `)).toBe('Mozilla/5.0')
    expect(sanitizeUserAgent('a\u0000b\u001Fc\u007Fd\u009Fe')).toBe('a b c d e')
    expect(sanitizeUserAgent('‮')).toBe('')
  })

  it('keeps ordinary text, including <img src=x onerror=…> as characters', () => {
    const ua = 'Mozilla/5.0 (X11; Linux) <img src=x onerror=alert(1)>'
    expect(sanitizeUserAgent(ua)).toBe(ua)
  })
})

describe('revoke copy', () => {
  it("states up to 12 hours and not a password change, never 'signed out' or 'immediately'", () => {
    for (const text of [REVOKE_ONE_EFFECT, REVOKE_ALL_EFFECT]) {
      expect(text).toContain('up to 12 hours')
      expect(text).toContain('not a password change')
      expect(text).not.toMatch(/signed out|immediately|logged out/i)
    }
    expect(SESSIONS_NOTE).toContain('up to 12 hours')
    expect(SESSIONS_NOTE).not.toMatch(/signed out|immediately|logged out/i)
  })
})
