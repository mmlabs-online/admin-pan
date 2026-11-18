import { describe, expect, it } from 'vitest'
import {
  REVOKE_ALL_EFFECT,
  REVOKE_ONE_EFFECT,
  SESSIONS_NOTE,
  sanitizeUserAgent,
} from './sessions'

describe('sanitizeUserAgent', () => {
  it('removes C0/C1 controls and bidi controls (U+202A–202E, U+2066–2069, U+200E, U+200F, U+061C) and trims', () => {
    const bidi =
      '\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\u200E\u200F\u061C'
    expect(sanitizeUserAgent(`  Mozilla${bidi}/5.0  `)).toBe('Mozilla/5.0')
    expect(sanitizeUserAgent('a\u0000b\u001Fc\u007Fd\u009Fe')).toBe('a b c d e')
    expect(sanitizeUserAgent('\u202E')).toBe('')
  })

  it('removes zero-width characters', () => {
    expect(sanitizeUserAgent('a\u200Bb\u200Cc\u200Dd\u2060e\uFEFFf')).toBe(
      'abcdef'
    )
  })

  it('removes interlinear annotation characters', () => {
    expect(sanitizeUserAgent('a\uFFF9b\uFFFAc\uFFFBd')).toBe('abcd')
  })

  it('removes tag characters', () => {
    expect(sanitizeUserAgent('a\u{E0001}b\u{E0041}c\u{E007F}d')).toBe('abcd')
  })

  it('maps line and paragraph separators to a space', () => {
    expect(sanitizeUserAgent('a\u2028b\u2029c')).toBe('a b c')
  })

  it('keeps ordinary text, including <img src=x onerror=…> as characters', () => {
    const ua = 'Mozilla/5.0 (X11; Linux) <img src=x onerror=alert(1)>'
    expect(sanitizeUserAgent(ua)).toBe(ua)
  })
})

describe('revoke copy', () => {
  it("admin-app access ends on the next admin request; only other apps' tokens last up to 12 hours; not a password change; disable to lock; never 'signed out' or 'immediately'", () => {
    for (const text of [SESSIONS_NOTE, REVOKE_ONE_EFFECT, REVOKE_ALL_EFFECT]) {
      expect(text).toContain('next admin request')
      expect(text).toContain('other apps')
      expect(text).toContain('up to 12 hours')
      expect(text).toContain('not a password change')
      expect(text).toMatch(/disable it/i)
      expect(text).toContain('new access tokens')
      expect(text).not.toMatch(
        /including this admin app|open apps can keep working|new access tokens only/i
      )
      expect(text).not.toMatch(/signed out|immediately|logged out/i)
    }
  })
})
