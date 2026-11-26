import { type ColumnDef } from '@tanstack/react-table'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { SortButton } from '@/components/data-table/sort-button'
import { LongText } from '@/components/long-text'
import { organizationStatuses, statusBadgeClasses } from '../data/data'
import { type Organization } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

export const organizationsColumns: ColumnDef<Organization>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <SortButton column={column} title='Name' />,
    cell: ({ row }) => (
      <LongText className='max-w-56 font-medium'>{row.original.name}</LongText>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'slug',
    header: ({ column }) => <SortButton column={column} title='Slug' />,
    cell: ({ row }) => (
      <span className='text-muted-foreground'>{row.original.slug}</span>
    ),
  },
  {
    accessorKey: 'status',
    enableSorting: false,
    header: ({ column }) => <SortButton column={column} title='Status' />,
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
    enableHiding: false,
  },
  {
    accessorKey: 'description',
    enableSorting: false,
    header: ({ column }) => <SortButton column={column} title='Description' />,
    cell: ({ row }) =>
      row.original.description ? (
        <LongText className='max-w-72'>{row.original.description}</LongText>
      ) : (
        <span className='text-muted-foreground'>
          <span aria-hidden='true'>—</span>
          <span className='sr-only'>No description</span>
        </span>
      ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => <SortButton column={column} title='Created at' />,
    cell: ({ row }) => (
      <time dateTime={row.original.created_at} className='text-nowrap'>
        {formatDate(row.original.created_at)}
      </time>
    ),
  },
  {
    id: 'actions',
    enableSorting: false,
    header: () => <span className='sr-only'>Actions</span>,
    cell: DataTableRowActions,
  },
]
