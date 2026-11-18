import { useEffect, useRef } from 'react'
import { RoleCreateDialog } from './role-create-dialog'
import { RoleDefaultDialog } from './role-default-dialog'
import { RoleDeleteDialog } from './role-delete-dialog'
import { RolePermissionsDialog } from './role-permissions-dialog'
import { RoleRenameDialog } from './role-rename-dialog'
import { useRoles } from './roles-provider'

// Radix returns focus only to a `Trigger`, and the menu item or button that
// opened these dialogs is not one (or has unmounted), so the browser would
// leave focus on <body>. Put it back on the row's actions button, or on
// New role when there is no row or the row is gone (R10).
function focusOpener(key?: string) {
  const target =
    (key &&
      document.querySelector<HTMLElement>(
        `[aria-label="Actions for ${key}"]`
      )) ||
    document.querySelector<HTMLElement>('[data-new-role]')
  target?.focus()
}

export function RolesDialogs() {
  const { app, open, setOpen, currentRow, setCurrentRow } = useRoles()

  const close = () => setOpen(null)
  const closeWithRow = () => {
    setOpen(null)
    setTimeout(() => setCurrentRow(null), 500)
  }
  // ConfirmDialog is an AlertDialog without a close-focus hook: focus the
  // opener in an effect, a frame later, once the dialog's focus scope has
  // released focus (it would otherwise move it to <body>). After a delete the
  // row is gone, so focus goes to New role.
  const restoreFor = useRef<{ key?: string } | null>(null)
  useEffect(() => {
    if (open === null && restoreFor.current) {
      const { key } = restoreFor.current
      restoreFor.current = null
      requestAnimationFrame(() => focusOpener(key))
    }
  }, [open])
  const closeConfirm = () => {
    restoreFor.current = { key: currentRow?.key }
    closeWithRow()
  }
  const closeDeleted = () => {
    restoreFor.current = {}
    closeWithRow()
  }

  if (!app) return null
  return (
    <>
      <RoleCreateDialog
        key={`role-create-${app.key}`}
        app={app}
        open={open === 'create'}
        onOpenChange={close}
        returnFocus={() => focusOpener()}
      />
      {currentRow && (
        <>
          <RoleRenameDialog
            key={`role-rename-${currentRow.id}`}
            app={app}
            currentRow={currentRow}
            open={open === 'rename'}
            onOpenChange={closeWithRow}
            returnFocus={() => focusOpener(currentRow.key)}
          />
          <RolePermissionsDialog
            key={`role-permissions-${currentRow.id}`}
            app={app}
            currentRow={currentRow}
            open={open === 'permissions'}
            onOpenChange={closeWithRow}
            returnFocus={() => focusOpener(currentRow.key)}
          />
          <RoleDeleteDialog
            key={`role-delete-${currentRow.id}`}
            app={app}
            currentRow={currentRow}
            open={open === 'delete'}
            onOpenChange={closeConfirm}
            onDeleted={closeDeleted}
          />
          <RoleDefaultDialog
            key={`role-default-${currentRow.id}`}
            app={app}
            currentRow={currentRow}
            open={open === 'default'}
            onOpenChange={closeConfirm}
          />
        </>
      )}
    </>
  )
}
