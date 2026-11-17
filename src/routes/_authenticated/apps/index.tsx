import { createFileRoute } from '@tanstack/react-router'
import { Apps } from '@/features/apps'
import { appsSearchSchema } from '@/features/apps/data/app-schema'

export const Route = createFileRoute('/_authenticated/apps/')({
  validateSearch: appsSearchSchema,
  component: Apps,
})
