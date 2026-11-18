import { format } from 'date-fns'
import { type ColumnDef } from '@tanstack/react-table'
import { SortButton } from '@/components/data-table/sort-button'
import { type App } from '../data/app-schema'
import { joinPolicyLabels, orgModeLabels } from '../data/data'
import { AppStatusBadge } from './app-status-badge'
import { AppsRowActions } from './apps-row-actions'

// No Members column yet (follow-up: `member_count` exists on AppRead). Only the
// columns the API can sort by (key, name, created_at) have a sort button.
export const appsColumns: ColumnDef<App>[] = [
  {
    accessorKey: 'key',
    header: ({ column }) => <SortButton column={column} title='Key' />,
    cell: ({ row }) => (
      <span className='font-mono text-sm'>{row.original.key}</span>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <SortButton column={column} title='Name' />,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => <AppStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'join_policy',
    header: 'Join policy',
    enableSorting: false,
    cell: ({ row }) => joinPolicyLabels[row.original.join_policy],
  },
  {
    accessorKey: 'org_mode',
    header: 'Org mode',
    enableSorting: false,
    cell: ({ row }) => orgModeLabels[row.original.org_mode],
  },
  {
    id: 'origins',
    accessorFn: (row) => row.origins.length,
    header: 'Origins',
    enableSorting: false,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => <SortButton column={column} title='Created' />,
    cell: ({ row }) => (
      <time dateTime={row.original.created_at} className='text-nowrap'>
        {format(new Date(row.original.created_at), 'MMM d, yyyy')}
      </time>
    ),
  },
  {
    id: 'actions',
    enableSorting: false,
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => <AppsRowActions app={row.original} />,
  },
]
