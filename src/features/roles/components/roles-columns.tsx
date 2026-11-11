import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { type Role } from '@/features/apps/data/schema'
import { RolesRowActions } from './roles-row-actions'

export type RoleRow = Role & {
  app_key: string
  is_default: boolean
  permission_count: number
  assignment_count: number
}

export const rolesColumns: ColumnDef<RoleRow>[] = [
  {
    id: 'app',
    accessorKey: 'app_key',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='App' />
    ),
    cell: ({ row }) => (
      <span className='font-mono text-sm'>{row.original.app_key}</span>
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    enableHiding: false,
  },
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
    cell: ({ row }) => (
      <div className='flex flex-wrap items-center gap-1'>
        {row.original.name}
        {row.original.is_system && <Badge variant='secondary'>System</Badge>}
        {row.original.is_default && <Badge>Default</Badge>}
      </div>
    ),
  },
  {
    accessorKey: 'permission_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Permissions' />
    ),
    meta: { className: 'text-end' },
  },
  {
    accessorKey: 'assignment_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Assignments' />
    ),
    meta: { className: 'text-end' },
  },
  {
    id: 'actions',
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => <RolesRowActions role={row.original} />,
    enableHiding: false,
  },
]
