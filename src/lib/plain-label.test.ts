import { describe, expect, it } from 'vitest'
import { toPlainLabel } from './plain-label'

describe('toPlainLabel', () => {
  it('removes C0/C1 controls and bidi controls (U+202A–202E, U+2066–2069, U+200E, U+200F, U+061C) and trims', () => {
    const bidi =
      '\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\u200E\u200F\u061C'
    expect(toPlainLabel(`  Mozilla${bidi}/5.0  `)).toBe('Mozilla/5.0')
    expect(toPlainLabel('a\u0000b\u001Fc\u007Fd\u009Fe')).toBe('a b c d e')
    expect(toPlainLabel('\u202E')).toBe('')
  })

  it('removes zero-width characters', () => {
    expect(toPlainLabel('a\u200Bb\u200Cc\u200Dd\u2060e\uFEFFf')).toBe('abcdef')
  })

  it('removes interlinear annotation characters', () => {
    expect(toPlainLabel('a\uFFF9b\uFFFAc\uFFFBd')).toBe('abcd')
  })

  it('removes tag characters', () => {
    expect(toPlainLabel('a\u{E0001}b\u{E0041}c\u{E007F}d')).toBe('abcd')
  })

  it('maps line and paragraph separators to a space', () => {
    expect(toPlainLabel('a\u2028b\u2029c')).toBe('a b c')
  })

  it('keeps ordinary text, including <img src=x onerror=…> as characters', () => {
    const ua = 'Mozilla/5.0 (X11; Linux) <img src=x onerror=alert(1)>'
    expect(toPlainLabel(ua)).toBe(ua)
  })
})
