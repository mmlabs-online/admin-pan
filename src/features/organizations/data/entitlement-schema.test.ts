import { describe, expect, it } from 'vitest'
import openapi from '@/api/openapi.json?raw'
import {
  LIMITS_MAX,
  LIMIT_KEY_PATTERN,
  LIMIT_VALUE_MAX,
  PLAN_PATTERN,
  entitlementFormSchema,
  formatLimitValue,
  fromLimits,
  limitsEqual,
  toLimits,
} from './entitlement-schema'

const row = (key: string, value: string) => ({ key, value })
const form = (over: {
  app_key?: string
  plan?: string
  limits?: { key: string; value: string }[]
}) =>
  entitlementFormSchema('grant').safeParse({
    app_key: 'calechip',
    plan: 'pro',
    limits: [],
    ...over,
  })
const limitIssues = (limits: { key: string; value: string }[]) =>
  form({ limits }).error?.issues.map((i) => i.path.join('.')) ?? []

describe('entitlementFormSchema', () => {
  it('drift: PLAN_PATTERN, LIMIT_KEY_PATTERN (patternProperties key), minimum 0, maximum = Number.MAX_SAFE_INTEGER, maxProperties 32 and app_key pattern equal EntitlementCreate in openapi.json', () => {
    const create = JSON.parse(openapi).components.schemas.EntitlementCreate
    const limits = create.properties.limits
    expect(create.properties.plan.pattern).toBe(PLAN_PATTERN.source)
    expect(Object.keys(limits.patternProperties)).toEqual([
      LIMIT_KEY_PATTERN.source,
    ])
    const value = limits.patternProperties[LIMIT_KEY_PATTERN.source]
    expect(value.minimum).toBe(0)
    expect(value.maximum).toBe(LIMIT_VALUE_MAX)
    expect(limits.maxProperties).toBe(LIMITS_MAX)
    expect(create.properties.app_key.pattern).toBe('^[a-z][a-z0-9-]{1,31}$')
  })

  it("plan: accepts 'pro', 'a', 'team_2-x', 63 chars; rejects '', 'Pro', '-x', 'a b', 64 chars; ' pro ' is trimmed to 'pro'", () => {
    for (const ok of ['pro', 'a', 'team_2-x', 'a'.repeat(63)])
      expect(form({ plan: ok }).success, ok).toBe(true)
    for (const bad of ['', 'Pro', '-x', 'a b', 'a'.repeat(64)])
      expect(form({ plan: bad }).success, bad).toBe(false)
    expect(form({ plan: ' pro ' }).data?.plan).toBe('pro')
  })

  it("limits: accepts 0 rows, 32 rows, value '0' and '9007199254740991'; rejects 33 rows, key 'Seats' / '1x' / 65 chars, value '' / '-1' / '1.5' / '1e3' / '9007199254740992', duplicate keys (error on the later row)", () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => row(`k${i}`, '1'))
    expect(form({ limits: [] }).success).toBe(true)
    expect(form({ limits: many(32) }).success).toBe(true)
    expect(form({ limits: many(33) }).success).toBe(false)
    expect(form({ limits: [row('a', '0')] }).success).toBe(true)
    expect(form({ limits: [row('a', '9007199254740991')] }).success).toBe(true)
    for (const key of ['Seats', '1x', 'a'.repeat(65)])
      expect(limitIssues([row(key, '1')]), key).toEqual(['limits.0.key'])
    for (const value of ['', '-1', '1.5', '1e3', '9007199254740992'])
      expect(limitIssues([row('a', value)]), value).toEqual(['limits.0.value'])
    expect(limitIssues([row('a', '1'), row('b', '2'), row('a', '3')])).toEqual([
      'limits.2.key',
    ])
  })

  it('app_key is required and pattern-checked in grant mode only', () => {
    expect(form({ app_key: '' }).success).toBe(false)
    expect(form({ app_key: 'Bad Key' }).success).toBe(false)
    expect(
      entitlementFormSchema('edit').safeParse({
        app_key: '',
        plan: 'pro',
        limits: [],
      }).success
    ).toBe(true)
  })
})

describe('limit helpers', () => {
  it('toLimits / fromLimits round-trip; limitsEqual ignores key order; formatLimitValue renders non-number values as JSON text', () => {
    const limits = { seats: 10, projects: 0 }
    expect(toLimits(fromLimits(limits))).toEqual(limits)
    expect(limitsEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(limitsEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(limitsEqual({ a: 1 }, { a: 1, b: 1 })).toBe(false)
    expect(formatLimitValue(10)).toBe('10')
    expect(formatLimitValue('x')).toBe('"x"')
    expect(formatLimitValue(null)).toBe('null')
    expect(fromLimits({ a: 'x' })).toEqual([row('a', '"x"')])
  })
})
