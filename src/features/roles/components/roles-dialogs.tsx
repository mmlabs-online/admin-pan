import { useAccessData } from '@/features/apps/data/access-store'
import { RoleAssignmentsSheet } from './role-assignments-sheet'
import { RoleDeleteDialog } from './role-delete-dialog'
import { RoleFormDialog } from './role-form-dialog'
import { useRoles } from './roles-provider'

export function RolesDialogs() {
  const { open, setOpen, currentId, setCurrentId } = useRoles()
  const { roles } = useAccessData()
  const currentRow = roles.find((r) => r.id === currentId)

  const close = (type: 'edit' | 'delete' | 'assignments') => () => {
    setOpen(type)
    setTimeout(() => setCurrentId(null), 500)
  }

  return (
    <>
      <RoleFormDialog
        key='role-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />
      {currentRow && (
        <>
          <RoleFormDialog
            key={`role-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={close('edit')}
            currentRow={currentRow}
          />
          <RoleDeleteDialog
            key={`role-delete-${currentRow.id}`}
            open={open === 'delete'}
            onOpenChange={close('delete')}
            currentRow={currentRow}
          />
          <RoleAssignmentsSheet
            key={`role-assignments-${currentRow.id}`}
            open={open === 'assignments'}
            onOpenChange={close('assignments')}
            role={currentRow}
          />
        </>
      )}
    </>
  )
}
