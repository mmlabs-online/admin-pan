import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { appStatusLabels } from '../data/data'
import { type AppStatus } from '../data/schema'

export function AppStatusBadge({ status }: { status: AppStatus }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        status === 'active'
          ? 'border-teal-200 bg-teal-100/30 text-teal-900 dark:text-teal-200'
          : 'border-neutral-300 bg-neutral-300/40 text-neutral-800 dark:text-neutral-200'
      )}
    >
      {appStatusLabels[status]}
    </Badge>
  )
}
