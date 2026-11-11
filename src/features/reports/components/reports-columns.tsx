import { format } from 'date-fns'
import { type ColumnDef } from '@tanstack/react-table'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import {
  scheduleLabel,
  statusBadgeClass,
  statusLabel,
  typeLabel,
} from '../data/data'
import { type Report } from '../data/schema'
import { ReportsRowActions } from './reports-row-actions'

const formatDateTime = (iso: string) =>
  format(new Date(iso), 'yyyy-MM-dd HH:mm')

export const reportsColumns: ColumnDef<Report>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-60 font-medium'>{row.original.name}</LongText>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Type' />
    ),
    cell: ({ row }) => (
      <span className='text-nowrap'>{typeLabel(row.original.type)}</span>
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'schedule',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Schedule' />
    ),
    cell: ({ row }) => scheduleLabel(row.original.schedule),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const { status } = row.original
      return (
        <Badge
          variant='outline'
          className={cn('gap-1', statusBadgeClass.get(status))}
        >
          {status === 'running' && (
            <Loader2 className='size-3 animate-spin' aria-hidden='true' />
          )}
          {statusLabel(status)}
        </Badge>
      )
    },
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    enableSorting: false,
  },
  {
    accessorKey: 'last_run_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Last run' />
    ),
    cell: ({ row }) => {
      const { last_run_at, row_count } = row.original
      if (!last_run_at)
        return <span className='text-muted-foreground'>Never</span>
      return (
        <div className='text-nowrap'>
          <time dateTime={last_run_at}>{formatDateTime(last_run_at)}</time>
          {row_count !== null && (
            <span className='block text-xs text-muted-foreground'>
              {row_count.toLocaleString('en-US')} rows
            </span>
          )}
        </div>
      )
    },
    sortingFn: (a, b) =>
      (a.original.last_run_at ?? '').localeCompare(
        b.original.last_run_at ?? ''
      ),
  },
  {
    accessorKey: 'created_by',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created by' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-48'>{row.original.created_by}</LongText>
    ),
  },
  {
    id: 'actions',
    header: () => <span className='sr-only'>Actions</span>,
    cell: ReportsRowActions,
  },
]
