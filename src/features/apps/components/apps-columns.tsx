import { type ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '@/components/data-table'
import { joinPolicyLabels, orgModeLabels } from '../data/data'
import { type App } from '../data/schema'
import { AppStatusBadge } from './app-status-badge'
import { AppsRowActions } from './apps-row-actions'

export type AppRow = App & { member_count: number }

export const appsColumns: ColumnDef<AppRow>[] = [
  {
    accessorKey: 'key',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Key' />
    ),
    cell: ({ row }) => (
      <span className='font-mono text-sm'>{row.original.key}</span>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <AppStatusBadge status={row.original.status} />,
    enableSorting: false,
  },
  {
    accessorKey: 'join_policy',
    header: 'Join policy',
    cell: ({ row }) => joinPolicyLabels[row.original.join_policy],
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    enableSorting: false,
  },
  {
    accessorKey: 'org_mode',
    header: 'Org mode',
    cell: ({ row }) => orgModeLabels[row.original.org_mode],
    enableSorting: false,
  },
  {
    id: 'origins',
    accessorFn: (row) => row.origins.length,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Origins' />
    ),
    meta: { className: 'text-end' },
  },
  {
    accessorKey: 'member_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Members' />
    ),
    cell: ({ row }) => row.original.member_count.toLocaleString('en-US'),
    meta: { className: 'text-end' },
  },
  {
    id: 'actions',
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => <AppsRowActions app={row.original} />,
    enableHiding: false,
  },
]
