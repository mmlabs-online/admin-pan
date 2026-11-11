import { UsersDetailSheet } from './users-detail-sheet'
import { useUsers } from './users-provider'
import { UsersStatusDialog } from './users-status-dialog'

export function UsersDialogs() {
  const { open, setOpen, currentRow } = useUsers()
  if (!currentRow) return null

  // Keep currentRow after closing so the close animation still has content.
  const close = () => setOpen(null)

  return (
    <>
      <UsersDetailSheet
        key={`user-view-${currentRow.id}`}
        open={open === 'view'}
        onOpenChange={(o) => !o && close()}
        currentRow={currentRow}
      />
      <UsersStatusDialog
        key={`user-status-${currentRow.id}`}
        open={open === 'status'}
        onOpenChange={(o) => !o && close()}
        currentRow={currentRow}
      />
    </>
  )
}
