import { describe, expect, it } from 'vitest'
import {
  APP_TOKEN_MAX_HOURS,
  assignmentEffect,
  scopeLabel,
  toExpiresAt,
  zoneLabel,
} from './assignments'

const BANNED =
  /immediate|instantly|right away|15 minutes|signed out|logged out/i

describe('assignmentEffect', () => {
  it("assignmentEffect('stoktok') names the app, the token expiry and 'up to 12 hours'", () => {
    const text = assignmentEffect('stoktok')
    expect(text).toContain('Users already signed in to stoktok')
    expect(text).toContain('until their current token expires')
    expect(text).toContain('up to 12 hours')
  })

  it("assignmentEffect('admin') says 'next admin request' and has no hours", () => {
    const text = assignmentEffect('admin')
    expect(text).toContain('next admin request')
    expect(text).not.toContain('hours')
  })

  it('no effect text claims the change is immediate or quotes the old 15 minutes', () => {
    for (const app of ['admin', 'stoktok', 'calechip'])
      expect(assignmentEffect(app)).not.toMatch(BANNED)
  })

  it('APP_TOKEN_MAX_HOURS is 12 and is the only source of the number in the copy', () => {
    expect(APP_TOKEN_MAX_HOURS).toBe(12)
    expect(assignmentEffect('stoktok')).toContain(
      `up to ${APP_TOKEN_MAX_HOURS} hours`
    )
    expect(assignmentEffect('stoktok').match(/\d+/g)).toEqual(['12'])
  })
})

describe('toExpiresAt', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it("'' gives null; a future value gives an ISO string ending in Z", () => {
    expect(toExpiresAt('', now)).toEqual({ ok: true, value: null })
    expect(toExpiresAt('   ', now)).toEqual({ ok: true, value: null })
    const r = toExpiresAt('2099-01-02T03:04', now)
    expect(r).toEqual({
      ok: true,
      value: new Date('2099-01-02T03:04').toISOString(),
    })
    expect(r.ok && r.value?.endsWith('Z')).toBe(true)
  })

  it('rejects garbage and a past value (now injected)', () => {
    expect(toExpiresAt('garbage', now)).toEqual({
      ok: false,
      error: 'Enter a valid date and time.',
    })
    expect(toExpiresAt('2020-01-01T00:00', now)).toEqual({
      ok: false,
      error: 'Pick a time in the future.',
    })
  })

  it('rejects a value whose local re-format differs (a day that does not exist)', () => {
    const r = toExpiresAt('2099-02-30T10:00', now)
    expect(r.ok).toBe(false)
  })
})

describe('zoneLabel / scopeLabel', () => {
  it('zoneLabel names the IANA zone and the UTC offset', () => {
    expect(zoneLabel()).toMatch(/^.+, UTC[+-]\d{2}:\d{2}$/)
    expect(zoneLabel()).toContain(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    )
  })

  it('scopeLabel: null is App-wide; an org shows its name, else its id', () => {
    expect(scopeLabel(null)).toBe('App-wide')
    expect(scopeLabel('o-1', 'Acme Corp')).toBe('Acme Corp')
    expect(scopeLabel('o-1')).toBe('Organization o-1')
  })
})
