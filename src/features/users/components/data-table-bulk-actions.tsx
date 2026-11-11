import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { UserX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { type User } from '../data/schema'
import { useUsers } from './users-provider'

type DataTableBulkActionsProps = {
  table: Table<User>
}

const MAX_LISTED = 5

/**
 * Bulk disable — one `PATCH /api/v1/users/{id} {status: 'disabled'}` per user
 * (admin:users:write).
 */
export function DataTableBulkActions({ table }: DataTableBulkActionsProps) {
  const { setUsersStatus } = useUsers()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const selected = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)
  const targets = selected.filter((u) => u.status === 'active')
  const plural = (n: number) => `${n} user${n === 1 ? '' : 's'}`

  const handleConfirm = () => {
    setUsersStatus(
      targets.map((u) => u.id),
      'disabled'
    )
    setConfirmOpen(false)
    table.resetRowSelection()
    toast.success(`Disabled ${plural(targets.length)}`)
  }

  return (
    <>
      <BulkActionsToolbar table={table} entityName='user'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='destructive'
              size='icon'
              onClick={() => setConfirmOpen(true)}
              disabled={targets.length === 0}
              className='size-8'
              aria-label='Disable selected users'
            >
              <UserX />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Disable selected users</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        handleConfirm={handleConfirm}
        destructive
        disabled={targets.length === 0}
        title={`Disable ${plural(targets.length)}`}
        desc={
          <div className='space-y-2'>
            <p>
              The following users will no longer be able to sign in to any
              mmlabs app:
            </p>
            <ul className='list-disc ps-5 font-medium text-foreground'>
              {targets.slice(0, MAX_LISTED).map((u) => (
                <li key={u.id}>{u.email}</li>
              ))}
              {targets.length > MAX_LISTED && (
                <li>and {targets.length - MAX_LISTED} more</li>
              )}
            </ul>
            {selected.length > targets.length && (
              <p>
                {plural(selected.length - targets.length)} already disabled will
                be skipped.
              </p>
            )}
          </div>
        }
        confirmText='Disable'
      />
    </>
  )
}
