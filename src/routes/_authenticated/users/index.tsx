import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Users } from '@/features/users'
import { userStatusSchema } from '@/features/users/data/schema'

// Mirrors GET /api/v1/users?email=&status=&limit=&offset= (admin:users:read)
const usersSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Facet filter
  status: z.array(userStatusSchema).optional().catch([]),
  // Email text filter
  email: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: usersSearchSchema,
  component: Users,
})
