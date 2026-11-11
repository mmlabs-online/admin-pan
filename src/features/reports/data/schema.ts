// Mock until org-admin-api provides a reports API (gap, not ticketed yet)
import { z } from 'zod'

export const reportTypeSchema = z.enum([
  'user_signups',
  'active_users',
  'app_memberships',
  'org_overview',
  'audit_activity',
])
export type ReportType = z.infer<typeof reportTypeSchema>

export const reportStatusSchema = z.enum([
  'ready',
  'running',
  'failed',
  'scheduled',
])
export type ReportStatus = z.infer<typeof reportStatusSchema>

export const reportFormatSchema = z.enum(['csv', 'xlsx'])
export type ReportFormat = z.infer<typeof reportFormatSchema>

export const reportScheduleSchema = z.enum([
  'none',
  'daily',
  'weekly',
  'monthly',
])
export type ReportSchedule = z.infer<typeof reportScheduleSchema>

/** ISO calendar date, e.g. `2026-11-01`. */
const isoDateSchema = z.iso.date()

export const reportParamsSchema = z.object({
  app_key: z.string().optional(),
  date_from: isoDateSchema,
  date_to: isoDateSchema,
})
export type ReportParams = z.infer<typeof reportParamsSchema>

/** Shape proposed for org-admin-api `GET /reports` items (snake_case). */
export const reportSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: reportTypeSchema,
  params: reportParamsSchema,
  format: reportFormatSchema,
  schedule: reportScheduleSchema,
  status: reportStatusSchema,
  last_run_at: z.iso.datetime().nullable(),
  row_count: z.number().int().nonnegative().nullable(),
  created_by: z.string(),
  created_at: z.iso.datetime(),
})
export type Report = z.infer<typeof reportSchema>

/** Sentinel select value for "no app filter" (Radix Select forbids ''). */
export const ALL_APPS = 'all'

export const reportFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(100, 'Name must be at most 100 characters.'),
    type: reportTypeSchema,
    app_key: z.string(),
    date_from: z.string().min(1, 'Start date is required.'),
    date_to: z.string().min(1, 'End date is required.'),
    format: reportFormatSchema,
    schedule: reportScheduleSchema,
  })
  .refine(
    ({ date_from, date_to }) => !date_from || !date_to || date_from <= date_to,
    {
      message: 'End date must be on or after the start date.',
      path: ['date_to'],
    }
  )
export type ReportFormValues = z.infer<typeof reportFormSchema>
