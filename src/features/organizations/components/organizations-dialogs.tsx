import { OrganizationsActionDialog } from './organizations-action-dialog'
import { OrganizationsDeleteDialog } from './organizations-delete-dialog'
import { useOrganizations } from './organizations-provider'
import { OrganizationsStatusDialog } from './organizations-status-dialog'

export function OrganizationsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useOrganizations()

  const closeWithRow = (dialog: 'edit' | 'status' | 'delete') => () => {
    setOpen(dialog)
    setTimeout(() => setCurrentRow(null), 500)
  }

  return (
    <>
      <OrganizationsActionDialog
        key='organization-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />

      {currentRow && (
        <>
          <OrganizationsActionDialog
            key={`organization-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={closeWithRow('edit')}
            currentRow={currentRow}
          />
          <OrganizationsStatusDialog
            key={`organization-status-${currentRow.id}`}
            open={open === 'status'}
            onOpenChange={closeWithRow('status')}
            currentRow={currentRow}
          />
          <OrganizationsDeleteDialog
            key={`organization-delete-${currentRow.id}`}
            open={open === 'delete'}
            onOpenChange={closeWithRow('delete')}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  )
}
