import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  actionBadgeClass,
  outcomeBadgeClass,
  outcomeLabels,
  targetLabels,
} from '../data/data'
import { type AuditLogEntry, type AuditTarget } from '../data/schema'
import { actorDisplay, formatTimestamp, shortId } from '../lib/format'

const dash = <span className='text-muted-foreground'>—</span>

export function getAuditLogColumns(
  onView: (entry: AuditLogEntry) => void
): ColumnDef<AuditLogEntry>[] {
  return [
    {
      accessorKey: 'occurred_at',
      header: 'Time',
      cell: ({ row }) => (
        <time
          dateTime={row.original.occurred_at}
          className='font-mono text-xs text-nowrap'
        >
          {formatTimestamp(row.original.occurred_at)}
        </time>
      ),
    },
    {
      id: 'actor',
      header: 'Actor',
      cell: ({ row }) => {
        const { actor_kind, actor_user_id } = row.original
        const text = actorDisplay(row.original)
        return (
          <div className='max-w-56 truncate'>
            {actor_kind === 'user' && actor_user_id ? (
              <code className='text-xs' title={actor_user_id}>
                {text}
              </code>
            ) : (
              <span
                className={cn(
                  actor_kind !== 'system' && 'text-muted-foreground'
                )}
              >
                {text}
              </span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <Badge
          variant='outline'
          className={cn('font-mono', actionBadgeClass(row.original.action))}
        >
          {row.original.action}
        </Badge>
      ),
    },
    {
      accessorKey: 'outcome',
      header: 'Outcome',
      cell: ({ row }) => (
        <Badge
          variant='outline'
          className={outcomeBadgeClass(row.original.outcome)}
        >
          {outcomeLabels[row.original.outcome] ?? row.original.outcome}
        </Badge>
      ),
    },
    {
      id: 'target',
      header: 'Target',
      cell: ({ row }) => {
        const { target_type, target_id } = row.original
        if (!target_type && !target_id) return dash
        return (
          <div className='text-nowrap'>
            <span>
              {targetLabels[target_type as AuditTarget] ?? target_type}
            </span>{' '}
            {target_id && (
              <code className='text-xs text-muted-foreground' title={target_id}>
                {shortId(target_id)}
              </code>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'app_key',
      header: 'App',
      cell: ({ row }) => row.original.app_key ?? dash,
    },
    {
      id: 'view',
      header: () => <span className='sr-only'>Details</span>,
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='sm'
          className='h-7'
          aria-label={`View ${row.original.action} at ${formatTimestamp(row.original.occurred_at)}`}
          onClick={() => onView(row.original)}
        >
          View
        </Button>
      ),
    },
  ]
}
