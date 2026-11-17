import { z } from 'zod'
import { type components } from '@/api'
import { APP_KEY_PATTERN } from '@/features/apps/data/app-schema'

// Generated from org-admin-api OpenAPI (R2); never hand-copy these shapes.
export type Entitlement = components['schemas']['EntitlementRead']
export type EntitlementCreate = components['schemas']['EntitlementCreate']
export type EntitlementUpdate = components['schemas']['EntitlementUpdate']

// Limits of `EntitlementCreate` (openapi.json); entitlement-schema.test.ts
// guards drift. `plan` and `limits` are labels and numbers owned by the
// consuming app: there is no catalogue and no billing here (R11).
export const PLAN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/
export const LIMIT_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
export const LIMITS_MAX = 32
export const LIMIT_VALUE_MAX = Number.MAX_SAFE_INTEGER

const LIMIT_KEY_MESSAGE =
  'Start with a lowercase letter; then lowercase letters, digits or _ (max 64).'
const LIMIT_VALUE_MESSAGE = `Use a whole number from 0 to ${LIMIT_VALUE_MAX}.`

export type LimitRow = { key: string; value: string }

// `app_key` is only checked in grant mode (edit shows it read-only).
export const entitlementFormSchema = (mode: 'grant' | 'edit') =>
  z.object({
    app_key: z
      .string()
      .trim()
      .refine((v) => mode === 'edit' || v.length > 0, 'App is required.')
      .refine(
        (v) => mode === 'edit' || v.length === 0 || APP_KEY_PATTERN.test(v),
        'Use 2–32 lowercase letters, digits and hyphens, starting with a letter.'
      ),
    plan: z
      .string()
      .trim()
      .min(1, 'Plan is required.')
      .regex(
        PLAN_PATTERN,
        'Use lowercase letters, digits, - and _; start with a letter or digit (max 63).'
      ),
    limits: z
      .array(z.object({ key: z.string(), value: z.string() }))
      .superRefine((rows, ctx) => {
        if (rows.length > LIMITS_MAX)
          ctx.addIssue({
            code: 'custom',
            message: `Use at most ${LIMITS_MAX} limits.`,
          })
        const seen = new Set<string>()
        rows.forEach(({ key, value }, index) => {
          if (!LIMIT_KEY_PATTERN.test(key))
            ctx.addIssue({
              code: 'custom',
              message: LIMIT_KEY_MESSAGE,
              path: [index, 'key'],
            })
          else if (seen.has(key))
            ctx.addIssue({
              code: 'custom',
              message: 'Each limit name must be used once.',
              path: [index, 'key'],
            })
          seen.add(key)
          if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
            ctx.addIssue({
              code: 'custom',
              message: LIMIT_VALUE_MESSAGE,
              path: [index, 'value'],
            })
        })
      }),
  })
export type EntitlementForm = z.infer<ReturnType<typeof entitlementFormSchema>>

export const toLimits = (rows: LimitRow[]): Record<string, number> =>
  Object.fromEntries(rows.map(({ key, value }) => [key, Number(value)]))

/** A non-number value (a future API shape) becomes its JSON text; validation then blocks saving it. */
export const fromLimits = (limits: Record<string, unknown>): LimitRow[] =>
  Object.entries(limits).map(([key, value]) => ({
    key,
    value: formatLimitValue(value),
  }))

export function limitsEqual(
  a: Record<string, number>,
  b: Record<string, number>
): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  )
}

export const formatLimitValue = (v: unknown): string =>
  typeof v === 'number' ? String(v) : JSON.stringify(v)
