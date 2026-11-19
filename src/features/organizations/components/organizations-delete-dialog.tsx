import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useDeleteOrganizationMutation } from '../api/queries'
import { organizationDeleteError } from '../data/errors'
import { type Organization } from '../data/schema'
import { useOrganizations } from './organizations-provider'

type OrganizationsDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Organization
}

// DELETE /api/v1/organizations/{org_id} (204) — admin:organizations:write.
// Typing the slug confirms; never optimistic (R9).
export function OrganizationsDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: OrganizationsDeleteDialogProps) {
  const { api } = useOrganizations()
  const mutation = useDeleteOrganizationMutation(api, {
    onSuccess: () =>
      toast.success(`Organization "${currentRow.name}" deleted.`),
  })
  const [typed, setTyped] = useState('')
  const matches = typed.trim() === currentRow.slug

  const handleDelete = () => {
    if (!matches || mutation.isPending) return
    mutation.mutate(
      { id: currentRow.id },
      {
        onSuccess: () => {
          setTyped('')
          onOpenChange(false)
        },
      }
    )
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return
    if (!next) {
      mutation.reset()
      setTyped('')
    }
    onOpenChange(next)
  }

  const failure = mutation.isError
    ? organizationDeleteError(mutation.error)
    : null

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      form='organization-delete-form'
      destructive
      disabled={!matches}
      isLoading={mutation.isPending}
      pendingText='Deleting…'
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
          Permanently delete{' '}
          <span className='font-bold'>{currentRow.name}</span> (
          {currentRow.slug})? This cannot be undone.
        </p>
      }
      confirmText='Delete'
      error={
        failure?.kind === 'forbidden' ? (
          <ForbiddenPanel variant='inline' copy={failure.copy} />
        ) : failure?.kind === 'message' ? (
          <p role='alert' className='text-sm text-destructive'>
            {failure.text}
          </p>
        ) : undefined
      }
    >
      <form
        id='organization-delete-form'
        onSubmit={(e) => {
          e.preventDefault()
          handleDelete()
        }}
        className='space-y-2'
      >
        <Label htmlFor='organization-delete-slug'>
          Type {currentRow.slug} to confirm
        </Label>
        <Input
          id='organization-delete-slug'
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete='off'
          spellCheck={false}
        />
      </form>
    </ConfirmDialog>
  )
}
