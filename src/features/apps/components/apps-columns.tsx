import { type ColumnDef } from '@tanstack/react-table'
import { type App } from '../data/app-schema'
import { joinPolicyLabels, orgModeLabels } from '../data/data'
import { AppStatusBadge } from './app-status-badge'
import { AppsRowActions } from './apps-row-actions'

// No Members column: the API has no member count per app (ADM-016). No
// sorting: the list endpoint has no `sort` (order is fixed by key).
export const appsColumns: ColumnDef<App>[] = [
  {
    accessorKey: 'key',
    header: 'Key',
    cell: ({ row }) => (
      <span className='font-mono text-sm'>{row.original.key}</span>
    ),
  },
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <AppStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'join_policy',
    header: 'Join policy',
    cell: ({ row }) => joinPolicyLabels[row.original.join_policy],
  },
  {
    accessorKey: 'org_mode',
    header: 'Org mode',
    cell: ({ row }) => orgModeLabels[row.original.org_mode],
  },
  {
    id: 'origins',
    accessorFn: (row) => row.origins.length,
    header: 'Origins',
  },
  {
    id: 'actions',
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => <AppsRowActions app={row.original} />,
  },
]
