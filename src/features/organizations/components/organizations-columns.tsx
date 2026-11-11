import { format } from 'date-fns'
import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { organizationStatuses, statusBadgeClasses } from '../data/data'
import { type Organization } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

export const organizationsColumns: ColumnDef<Organization>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => (
      <div className='flex max-w-56 flex-col'>
        <LongText className='font-medium'>{row.original.name}</LongText>
        <span className='truncate text-xs text-muted-foreground'>
          {row.original.slug}
        </span>
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const { status } = row.original
      const label =
        organizationStatuses.find((s) => s.value === status)?.label ?? status
      return (
        <Badge variant='outline' className={cn(statusBadgeClasses.get(status))}>
          {label}
        </Badge>
      )
    },
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Description' />
    ),
    cell: ({ row }) =>
      row.original.description ? (
        <LongText className='max-w-72'>{row.original.description}</LongText>
      ) : (
        <span className='text-muted-foreground'>
          <span aria-hidden='true'>—</span>
          <span className='sr-only'>No description</span>
        </span>
      ),
    enableSorting: false,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created at' />
    ),
    cell: ({ row }) => (
      <time dateTime={row.original.created_at} className='text-nowrap'>
        {format(new Date(row.original.created_at), 'MMM d, yyyy')}
      </time>
    ),
    // ISO-8601 strings sort chronologically as text
    sortingFn: 'text',
  },
  {
    id: 'actions',
    header: () => <span className='sr-only'>Actions</span>,
    cell: DataTableRowActions,
  },
]
