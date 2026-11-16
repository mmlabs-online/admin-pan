import { createFileRoute } from '@tanstack/react-router'
import { Users } from '@/features/users'
import { usersSearchSchema } from '@/features/users/data/schema'

// Mirrors GET /api/v1/users?status=&limit=&offset= (admin:users:read); the
// email filter is component state, not URL state (R5, ADR 0005).
export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: usersSearchSchema,
  component: Users,
})
