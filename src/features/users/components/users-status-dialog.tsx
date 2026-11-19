import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useSetUserStatusMutation } from '../api/queries'
import { statusChangeError } from '../data/errors'
import { type User } from '../data/schema'
import { DISABLE_EFFECT, ENABLE_EFFECT } from '../data/status'
import { useUsers } from './users-provider'

type UsersStatusDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
}

/**
 * Confirm enabling/disabling one user.
 * `PATCH /api/v1/users/{id} {status}` — admin:users:write. Never optimistic:
 * the dialog stays open until the API answers (R9).
 */
export function UsersStatusDialog({
  open,
  onOpenChange,
  currentRow,
}: UsersStatusDialogProps) {
  const { api } = useUsers()
  const disabling = currentRow.status === 'active'
  const nextStatus = disabling ? 'disabled' : 'active'
  const mutation = useSetUserStatusMutation(api, {
    onSuccess: () =>
      toast.success(
        `${disabling ? 'Disabled' : 'Enabled'} ${currentRow.email}`
      ),
  })

  const handleConfirm = () => {
    mutation.mutate(
      { id: currentRow.id, status: nextStatus },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return
    if (!next) mutation.reset()
    onOpenChange(next)
  }

  const failure = mutation.isError ? statusChangeError(mutation.error) : null

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      handleConfirm={handleConfirm}
      isLoading={mutation.isPending}
      pendingText={disabling ? 'Disabling…' : 'Enabling…'}
      destructive={disabling}
      title={disabling ? 'Disable user' : 'Enable user'}
      desc={
        <p>
          {disabling ? 'Disable ' : 'Enable '}
          <span className='font-semibold text-foreground'>
            {currentRow.email}
          </span>
          {currentRow.display_name ? ` (${currentRow.display_name})` : ''}?{' '}
          {disabling ? DISABLE_EFFECT : ENABLE_EFFECT}
        </p>
      }
      confirmText={disabling ? 'Disable' : 'Enable'}
      error={
        failure?.kind === 'forbidden' ? (
          <ForbiddenPanel variant='inline' copy={failure.copy} />
        ) : failure?.kind === 'message' ? (
          <p role='alert' className='text-sm text-destructive'>
            {failure.text}
          </p>
        ) : undefined
      }
    />
  )
}
