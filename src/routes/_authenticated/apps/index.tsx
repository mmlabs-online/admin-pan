import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Apps } from '@/features/apps'
import { joinPolicySchema } from '@/features/apps/data/schema'

const appsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Text search over app key and name
  filter: z.string().optional().catch(''),
  join_policy: z.array(joinPolicySchema).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/apps/')({
  validateSearch: appsSearchSchema,
  component: Apps,
})
