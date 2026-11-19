import { useRef } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type App } from '@/features/apps/data/app-schema'
import { useDeleteRoleMutation } from '../api/queries'
import { roleDeleteError } from '../data/errors'
import { type RoleDefinition } from '../data/role-schema'
import { RoleAlertView } from './role-alert-view'
import { useRoles } from './roles-provider'

type RoleDeleteDialogProps = {
  app: App
  currentRow: RoleDefinition
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The role is gone: its row can't take focus back. */
  onDeleted: () => void
}

// DELETE /api/v1/apps/{key}/roles/{role_id} — admin:roles:manage. The API
// refuses system, default and org owner roles and roles that users hold (409
// `conflict`, shown inline). Never optimistic (R9).
export function RoleDeleteDialog({
  app,
  currentRow,
  open,
  onOpenChange,
  onDeleted,
}: RoleDeleteDialogProps) {
  const { api } = useRoles()
  const mutation = useDeleteRoleMutation(app.key, api, {
    onSuccess: () => toast.success(`Role ${currentRow.key} deleted.`),
  })
  const inFlight = useRef(false)

  const handleConfirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate(currentRow.id, {
      onSuccess: () => {
        onDeleted()
      },
      onSettled: () => {
        inFlight.current = false
      },
    })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return
    if (!next) mutation.reset()
    onOpenChange(next)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      handleConfirm={handleConfirm}
      isLoading={mutation.isPending}
      pendingText='Deleting…'
      destructive
      title={`Delete role ${currentRow.key}?`}
      desc={
        <p>
          Delete <span className='font-bold'>{currentRow.name}</span> (
          {currentRow.key}) from {app.name}? This can&apos;t be undone. The API
          refuses if it is a system, default or org owner role, or if users hold
          it.
        </p>
      }
      confirmText='Delete'
      error={
        mutation.isError ? (
          <RoleAlertView alert={roleDeleteError(mutation.error)} />
        ) : undefined
      }
    />
  )
}
