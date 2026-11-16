import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { formatDate } from '../data/data'
import { type User } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'
import { UserStatusBadge } from './user-status-badge'

export const usersColumns: ColumnDef<User>[] = [
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Email' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-56 ps-3'>{row.original.email}</LongText>
    ),
    meta: {
      className: cn(
        'drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.1)] dark:drop-shadow-[0_1px_2px_rgb(255_255_255_/_0.1)]',
        'inset-s-0 ps-0.5 max-md:sticky @4xl/content:table-cell @4xl/content:drop-shadow-none'
      ),
    },
    enableHiding: false,
  },
  {
    id: 'display_name',
    accessorFn: (row) => row.display_name ?? '',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Display name' />
    ),
    cell: ({ row }) =>
      row.original.display_name ? (
        <LongText className='max-w-40'>{row.original.display_name}</LongText>
      ) : (
        <span className='text-muted-foreground'>—</span>
      ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
    enableHiding: false,
    enableSorting: false,
  },
  {
    accessorKey: 'email_verified_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Email verified' />
    ),
    cell: ({ row }) => {
      const verifiedAt = row.original.email_verified_at
      return verifiedAt ? (
        <time dateTime={verifiedAt} className='text-nowrap'>
          {formatDate(verifiedAt)}
        </time>
      ) : (
        <span className='text-muted-foreground'>Not verified</span>
      )
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created at' />
    ),
    cell: ({ row }) => (
      <time dateTime={row.original.created_at} className='text-nowrap'>
        {formatDate(row.original.created_at)}
      </time>
    ),
  },
  {
    id: 'actions',
    cell: DataTableRowActions,
  },
]
