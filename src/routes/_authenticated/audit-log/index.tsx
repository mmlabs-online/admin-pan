import { createFileRoute } from '@tanstack/react-router'
import { AuditLog } from '@/features/audit-log'
import { auditLogSearchSchema } from '@/features/audit-log/data/search'

export const Route = createFileRoute('/_authenticated/audit-log/')({
  validateSearch: auditLogSearchSchema,
  component: AuditLog,
})
