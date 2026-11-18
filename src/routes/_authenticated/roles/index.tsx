import { createFileRoute } from '@tanstack/react-router'
import { Roles } from '@/features/roles'
import { rolesSearchSchema } from '@/features/roles/data/role-schema'

export const Route = createFileRoute('/_authenticated/roles/')({
  validateSearch: rolesSearchSchema,
  component: Roles,
})
