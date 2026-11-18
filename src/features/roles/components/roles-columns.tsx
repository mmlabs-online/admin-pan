import { type ColumnDef } from '@tanstack/react-table'
import { type RoleDefinition } from '../data/role-schema'
import { RoleNameCell } from './role-name-cell'
import { RolesRowActions } from './roles-row-actions'

// No Assignments column: the API has no assignment count (R1). No sorting:
// the list endpoint has no `sort` (order is fixed by key).
export const rolesColumns: ColumnDef<RoleDefinition>[] = [
  {
    accessorKey: 'key',
    header: 'Key',
    cell: ({ row }) => (
      <span className='font-mono text-sm'>{row.original.key}</span>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <RoleNameCell role={row.original} />,
  },
  {
    id: 'permissions',
    header: 'Permissions',
    cell: ({ row }) => `${row.original.permissions.length} permissions`,
  },
  {
    id: 'privileged',
    header: 'Privileged',
    cell: ({ row }) =>
      row.original.privileged ? (
        <>
          Yes<span className='sr-only'>, granting it needs admin:*</span>
        </>
      ) : (
        '—'
      ),
  },
  {
    id: 'actions',
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => <RolesRowActions role={row.original} />,
  },
]
