import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deleteRole, useAccessData } from '@/features/apps/data/access-store'
import { type Role } from '@/features/apps/data/schema'

type RoleDeleteDialogProps = {
  currentRow: Role
  open: boolean
  onOpenChange: (open: boolean) => void
}

// admin:apps:write (planned name). System roles cannot be deleted.
export function RoleDeleteDialog({
  currentRow,
  open,
  onOpenChange,
}: RoleDeleteDialogProps) {
  const { role_assignments } = useAccessData()
  const assignmentCount = role_assignments.filter(
    (ra) => ra.role_id === currentRow.id
  ).length

  const handleConfirm = () => {
    if (currentRow.is_system) return
    deleteRole(currentRow.id)
    toast.success(`Role ${currentRow.key} deleted.`)
    onOpenChange(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleConfirm}
      disabled={currentRow.is_system}
      destructive
      title={`Delete role ${currentRow.key}?`}
      desc={
        currentRow.is_system
          ? `${currentRow.key} is a system role and cannot be deleted.`
          : `This permanently deletes ${currentRow.name} (${currentRow.key})` +
            (assignmentCount
              ? ` and revokes it from ${assignmentCount} assignment${assignmentCount === 1 ? '' : 's'}.`
              : '.')
      }
      confirmText='Delete'
    />
  )
}
