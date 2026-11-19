import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useUpdateOrganizationMutation } from '../api/queries'
import { organizationStatusError } from '../data/errors'
import { type Organization } from '../data/schema'
import { useOrganizations } from './organizations-provider'

type OrganizationsStatusDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Organization
}

// Suspend / reactivate: PATCH /api/v1/organizations/{org_id} { status } —
// admin:organizations:write. Never optimistic: the dialog stays open until the
// API answers (R9).
export function OrganizationsStatusDialog({
  open,
  onOpenChange,
  currentRow,
}: OrganizationsStatusDialogProps) {
  const { api } = useOrganizations()
  const suspend = currentRow.status === 'active'
  const mutation = useUpdateOrganizationMutation(api, {
    onSuccess: () =>
      toast.success(
        suspend
          ? `Organization "${currentRow.name}" suspended.`
          : `Organization "${currentRow.name}" reactivated.`
      ),
  })

  const handleConfirm = () => {
    mutation.mutate(
      {
        id: currentRow.id,
        body: { status: suspend ? 'suspended' : 'active' },
      },
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

  const failure = mutation.isError
    ? organizationStatusError(mutation.error)
    : null

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      handleConfirm={handleConfirm}
      isLoading={mutation.isPending}
      pendingText={suspend ? 'Suspending…' : 'Reactivating…'}
      destructive={suspend}
      title={suspend ? 'Suspend organization' : 'Reactivate organization'}
      desc={
        <p>
          {suspend ? 'Suspend ' : 'Reactivate '}
          <span className='font-bold'>{currentRow.name}</span> (
          {currentRow.slug})?{' '}
          {suspend
            ? "Members can't get new access to mmlabs apps in this organization until it is reactivated. Access already granted lasts until it expires."
            : 'Members can get access to mmlabs apps in this organization again.'}
        </p>
      }
      confirmText={suspend ? 'Suspend' : 'Reactivate'}
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
