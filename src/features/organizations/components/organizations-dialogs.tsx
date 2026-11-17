import { OrganizationDetailSheet } from './organization-detail-sheet'
import { OrganizationsActionDialog } from './organizations-action-dialog'
import { OrganizationsDeleteDialog } from './organizations-delete-dialog'
import { useOrganizations } from './organizations-provider'
import { OrganizationsStatusDialog } from './organizations-status-dialog'

export function OrganizationsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow, viewButtons } =
    useOrganizations()

  const close = () => setOpen(null)
  const closeWithRow = () => {
    setOpen(null)
    setTimeout(() => setCurrentRow(null), 500)
  }

  return (
    <>
      <OrganizationsActionDialog
        key='organization-create'
        open={open === 'create'}
        onOpenChange={close}
      />

      {currentRow && (
        <>
          <OrganizationsActionDialog
            key={`organization-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={closeWithRow}
            currentRow={currentRow}
          />
          <OrganizationsStatusDialog
            key={`organization-status-${currentRow.id}`}
            open={open === 'status'}
            onOpenChange={closeWithRow}
            currentRow={currentRow}
          />
          <OrganizationsDeleteDialog
            key={`organization-delete-${currentRow.id}`}
            open={open === 'delete'}
            onOpenChange={closeWithRow}
            currentRow={currentRow}
          />
          <OrganizationDetailSheet
            key={`organization-view-${currentRow.id}`}
            open={open === 'view'}
            onOpenChange={closeWithRow}
            currentRow={currentRow}
            returnFocus={() => viewButtons.current.get(currentRow.id)?.focus()}
          />
        </>
      )}
    </>
  )
}
