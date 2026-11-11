import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Roles } from '@/features/roles'

const rolesSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Text search over role key and name
  filter: z.string().optional().catch(''),
  // App keys
  app: z.array(z.string()).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/roles/')({
  validateSearch: rolesSearchSchema,
  component: Roles,
})
