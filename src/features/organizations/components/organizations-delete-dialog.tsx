import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type Organization } from '../data/schema'
import { useOrganizations } from './organizations-provider'

type OrganizationsDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Organization
}

// admin:orgs:delete (planned name) — DELETE /api/v1/organizations/{id}
export function OrganizationsDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: OrganizationsDeleteDialogProps) {
  const { deleteOrganization } = useOrganizations()

  const handleConfirm = () => {
    deleteOrganization(currentRow.id)
    toast.success(`Organization "${currentRow.name}" deleted.`)
    onOpenChange(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleConfirm}
      destructive
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
            aria-hidden='true'
          />{' '}
          Delete organization
        </span>
      }
      desc={
        <p>
          Are you sure you want to delete{' '}
          <span className='font-bold'>{currentRow.name}</span> (
          {currentRow.slug})? This cannot be undone.
        </p>
      }
      confirmText='Delete'
    />
  )
}
