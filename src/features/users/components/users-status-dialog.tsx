import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type User } from '../data/schema'
import { useUsers } from './users-provider'

type UsersStatusDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
}

/**
 * Confirm enabling/disabling one user.
 * `PATCH /api/v1/users/{id} {status}` — admin:users:write
 */
export function UsersStatusDialog({
  open,
  onOpenChange,
  currentRow,
}: UsersStatusDialogProps) {
  const { setUsersStatus } = useUsers()
  const disabling = currentRow.status === 'active'
  const nextStatus = disabling ? 'disabled' : 'active'

  const handleConfirm = () => {
    setUsersStatus([currentRow.id], nextStatus)
    onOpenChange(false)
    toast.success(`${disabling ? 'Disabled' : 'Enabled'} ${currentRow.email}`)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleConfirm}
      destructive={disabling}
      title={disabling ? 'Disable user' : 'Enable user'}
      desc={
        <p>
          {disabling ? 'Disable ' : 'Enable '}
          <span className='font-semibold text-foreground'>
            {currentRow.email}
          </span>
          {currentRow.display_name ? ` (${currentRow.display_name})` : ''}?{' '}
          {disabling
            ? 'They will no longer be able to sign in to any mmlabs app.'
            : 'They will be able to sign in to mmlabs apps again.'}
        </p>
      }
      confirmText={disabling ? 'Disable' : 'Enable'}
    />
  )
}
