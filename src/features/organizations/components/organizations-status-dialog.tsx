import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type Organization } from '../data/schema'
import { useOrganizations } from './organizations-provider'

type OrganizationsStatusDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Organization
}

// Suspend / reactivate: admin:orgs:write (planned name) — PATCH /api/v1/organizations/{id} { status }
export function OrganizationsStatusDialog({
  open,
  onOpenChange,
  currentRow,
}: OrganizationsStatusDialogProps) {
  const { updateOrganization } = useOrganizations()
  const suspend = currentRow.status === 'active'

  const handleConfirm = () => {
    updateOrganization(currentRow.id, {
      status: suspend ? 'suspended' : 'active',
    })
    toast.success(
      suspend
        ? `Organization "${currentRow.name}" suspended.`
        : `Organization "${currentRow.name}" reactivated.`
    )
    onOpenChange(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleConfirm}
      destructive={suspend}
      title={suspend ? 'Suspend organization' : 'Reactivate organization'}
      desc={
        <p>
          {suspend ? 'Suspend ' : 'Reactivate '}
          <span className='font-bold'>{currentRow.name}</span> (
          {currentRow.slug})?{' '}
          {suspend
            ? 'Its members lose access to mmlabs apps until it is reactivated.'
            : 'Its members regain access to mmlabs apps.'}
        </p>
      }
      confirmText={suspend ? 'Suspend' : 'Reactivate'}
    />
  )
}
