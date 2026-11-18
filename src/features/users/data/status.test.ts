import { describe, expect, it } from 'vitest'
import { APP_TOKEN_MAX_HOURS } from './assignments'
import { DISABLE_EFFECT, ENABLE_EFFECT } from './status'

describe('status copy', () => {
  it('DISABLE_EFFECT states next-admin-request and up-to-12-hours and does not overclaim', () => {
    expect(DISABLE_EFFECT).toContain('next admin request')
    expect(DISABLE_EFFECT).toContain(`up to ${APP_TOKEN_MAX_HOURS} hours`)
    expect(DISABLE_EFFECT).not.toMatch(
      /signed out|logged out|immediately|every mmlabs app/i
    )
  })

  it('ENABLE_EFFECT does not promise restored sessions', () => {
    expect(ENABLE_EFFECT).toMatch(/stay ended/)
    expect(ENABLE_EFFECT).not.toMatch(/restored|signed in again automatically/i)
  })
})
