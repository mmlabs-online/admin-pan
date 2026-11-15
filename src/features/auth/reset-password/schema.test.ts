import { describe, expect, it } from 'vitest'
import { resetPasswordSchema } from './schema'

const ok = (new_password: string, confirm = new_password) =>
  resetPasswordSchema.safeParse({ new_password, confirm }).success

describe('resetPasswordSchema', () => {
  it('required, <=128 after NFKC, confirm must match, no trimming', () => {
    expect(ok('')).toBe(false)
    expect(ok('a'.repeat(128))).toBe(true)
    expect(ok('a'.repeat(129))).toBe(false)
    // U+FB01 (ligature) normalises to two characters
    expect(ok('ﬁ'.repeat(65))).toBe(false)
    expect(ok('abc', 'abd')).toBe(false)
    const r = resetPasswordSchema.parse({ new_password: ' a ', confirm: ' a ' })
    expect(r.new_password).toBe(' a ')
  })
})
