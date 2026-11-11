import { describe, expect, it } from 'vitest'
import { reports } from './reports'
import { reportFormSchema, reportSchema } from './schema'

const VALID = {
  name: 'Weekly sign-ups',
  type: 'user_signups',
  app_key: 'all',
  date_from: '2026-10-01',
  date_to: '2026-10-31',
  format: 'csv',
  schedule: 'weekly',
} as const

describe('reportFormSchema', () => {
  it('accepts a valid definition', () => {
    expect(reportFormSchema.safeParse(VALID).success).toBe(true)
  })

  it('accepts a single-day range', () => {
    const r = reportFormSchema.safeParse({ ...VALID, date_to: '2026-10-01' })
    expect(r.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const r = reportFormSchema.safeParse({ ...VALID, name: '   ' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].path).toEqual(['name'])
  })

  it('rejects date_from after date_to', () => {
    const r = reportFormSchema.safeParse({ ...VALID, date_from: '2026-11-02' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]).toMatchObject({
      path: ['date_to'],
      message: 'End date must be on or after the start date.',
    })
  })
})

describe('mock reports', () => {
  it('match the report schema', () => {
    expect(reports).toHaveLength(25)
    for (const report of reports) {
      expect(reportSchema.safeParse(report).success).toBe(true)
    }
  })
})
