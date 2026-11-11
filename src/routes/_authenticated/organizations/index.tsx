import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Organizations } from '@/features/organizations'

const organizationsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Name/slug text search
  filter: z.string().optional().catch(''),
  // Status facet
  status: z
    .array(z.enum(['active', 'suspended']))
    .optional()
    .catch([]),
})

export const Route = createFileRoute('/_authenticated/organizations/')({
  validateSearch: organizationsSearchSchema,
  component: Organizations,
})
