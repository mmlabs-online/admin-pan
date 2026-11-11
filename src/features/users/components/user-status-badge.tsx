import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { statusBadgeClass, statusOptions } from '../data/data'
import { type User } from '../data/schema'

export function UserStatusBadge({ status }: { status: User['status'] }) {
  const label = statusOptions.find((s) => s.value === status)?.label ?? status
  return (
    <Badge variant='outline' className={cn(statusBadgeClass.get(status))}>
      {label}
    </Badge>
  )
}
