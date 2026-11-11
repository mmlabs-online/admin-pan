import { format } from 'date-fns'
import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table'
import { actionBadgeClass } from '../data/data'
import { type AuditLogEntry } from '../data/schema'
import { actorLabel, matchesActor, shortId } from '../lib/format'

export function formatTimestamp(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd HH:mm:ss')
}

const includesFilter = (
  row: { getValue: (id: string) => unknown },
  id: string,
  value: unknown
) => Array.isArray(value) && value.includes(row.getValue(id))

export function getAuditLogColumns(
  onView: (entry: AuditLogEntry) => void
): ColumnDef<AuditLogEntry>[] {
  return [
    {
      accessorKey: 'occurred_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Time' />
      ),
      cell: ({ row }) => (
        <time
          dateTime={row.original.occurred_at}
          className='ps-2 font-mono text-xs text-nowrap'
        >
          {formatTimestamp(row.original.occurred_at)}
        </time>
      ),
      sortingFn: 'alphanumeric',
      enableHiding: false,
    },
    {
      id: 'actor',
      accessorFn: (entry) => actorLabel(entry),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Actor' />
      ),
      cell: ({ row }) => {
        const { actor_email, actor_user_id } = row.original
        const isSystem = !actor_email && !actor_user_id
        return (
          <div className='max-w-56 truncate'>
            <span className={cn(isSystem && 'text-muted-foreground italic')}>
              {actorLabel(row.original)}
            </span>
            {actor_email && !actor_user_id && (
              <span className='ms-1 text-xs text-muted-foreground'>
                (unknown account)
              </span>
            )}
          </div>
        )
      },
      filterFn: (row, _id, value) =>
        typeof value === 'string' ? matchesActor(row.original, value) : true,
      enableSorting: false,
    },
    {
      accessorKey: 'action',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Action' />
      ),
      cell: ({ row }) => (
        <Badge
          variant='outline'
          className={cn('font-mono', actionBadgeClass(row.original.action))}
        >
          {row.original.action}
        </Badge>
      ),
      filterFn: includesFilter,
      enableSorting: false,
    },
    {
      accessorKey: 'target_type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Target' />
      ),
      cell: ({ row }) => (
        <div className='text-nowrap'>
          <span className='capitalize'>{row.original.target_type}</span>{' '}
          <span
            className='font-mono text-xs text-muted-foreground'
            title={row.original.target_id}
          >
            {shortId(row.original.target_id)}
          </span>
        </div>
      ),
      filterFn: includesFilter,
      enableSorting: false,
    },
    {
      accessorKey: 'app_key',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='App' />
      ),
      cell: ({ row }) =>
        row.original.app_key ?? (
          <span className='text-muted-foreground'>—</span>
        ),
      filterFn: includesFilter,
      enableSorting: false,
    },
    {
      accessorKey: 'ip',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='IP' />
      ),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.ip}</span>
      ),
      enableSorting: false,
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
          onClick={(event) => {
            event.stopPropagation()
            onView(row.original)
          }}
        >
          View
        </Button>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
