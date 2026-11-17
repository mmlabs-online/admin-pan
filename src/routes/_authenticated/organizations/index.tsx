import { createFileRoute } from '@tanstack/react-router'
import { Organizations } from '@/features/organizations'
import { organizationsSearchSchema } from '@/features/organizations/data/schema'

export const Route = createFileRoute('/_authenticated/organizations/')({
  validateSearch: organizationsSearchSchema,
  component: Organizations,
})
