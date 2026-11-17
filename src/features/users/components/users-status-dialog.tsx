import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useSetUserStatusMutation } from '../api/queries'
import { statusChangeError } from '../data/errors'
import { type User } from '../data/schema'
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
  const mutation = useSetUserStatusMutation(api)
  const disabling = currentRow.status === 'active'
  const nextStatus = disabling ? 'disabled' : 'active'

  const handleConfirm = () => {
    mutation.mutate(
      { id: currentRow.id, status: nextStatus },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success(
            `${disabling ? 'Disabled' : 'Enabled'} ${currentRow.email}`
          )
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
          {disabling
            ? "They will be signed out of every mmlabs app: all their sessions are revoked and any password-reset or verification links stop working. They can't sign in until re-enabled."
            : 'They will be able to sign in to mmlabs apps again.'}
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
