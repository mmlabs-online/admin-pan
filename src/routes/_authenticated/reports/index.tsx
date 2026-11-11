import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Reports } from '@/features/reports'
import {
  reportStatusSchema,
  reportTypeSchema,
} from '@/features/reports/data/schema'

const reportsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Facet filters
  type: z.array(reportTypeSchema).optional().catch([]),
  status: z.array(reportStatusSchema).optional().catch([]),
  // Name search
  name: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/reports/')({
  validateSearch: reportsSearchSchema,
  component: Reports,
})
