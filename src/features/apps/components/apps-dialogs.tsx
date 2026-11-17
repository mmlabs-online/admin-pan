import { useEffect, useRef } from 'react'
import { AppDetailSheet } from './app-detail-sheet'
import { AppFormDialog } from './app-form-dialog'
import { AppStatusDialog } from './app-status-dialog'
import { useApps } from './apps-provider'

// Radix returns focus only to a `Trigger`, and the menu item or button that
// opened these dialogs is not one (or has unmounted), so the browser would
// leave focus on <body>. Put it back on the row's actions button, or on
// Register app when there is no row (R10).
function focusOpener(key?: string) {
  const target =
    (key &&
      document.querySelector<HTMLElement>(
        `[aria-label="Actions for ${key}"]`
      )) ||
    document.querySelector<HTMLElement>('[data-register-app]')
  target?.focus()
}

export function AppsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useApps()

  const close = () => setOpen(null)
  const closeWithRow = () => {
    setOpen(null)
    setTimeout(() => setCurrentRow(null), 500)
  }
  // ConfirmDialog is an AlertDialog without a close-focus hook: focus the
  // opener in an effect, once the dialog no longer traps focus.
  const restoreFor = useRef<string | null>(null)
  useEffect(() => {
    if (open === null && restoreFor.current) {
      focusOpener(restoreFor.current)
      restoreFor.current = null
    }
  }, [open])
  const closeStatus = () => {
    restoreFor.current = currentRow?.key ?? null
    closeWithRow()
  }

  return (
    <>
      <AppFormDialog
        key='app-create'
        open={open === 'create'}
        onOpenChange={close}
        returnFocus={() => focusOpener()}
      />
      {currentRow && (
        <>
          <AppFormDialog
            key={`app-edit-${currentRow.key}`}
            open={open === 'edit'}
            onOpenChange={closeWithRow}
            returnFocus={() => focusOpener(currentRow.key)}
            currentRow={currentRow}
          />
          <AppStatusDialog
            key={`app-status-${currentRow.key}`}
            open={open === 'status'}
            onOpenChange={closeStatus}
            currentRow={currentRow}
          />
          <AppDetailSheet
            key={`app-view-${currentRow.key}`}
            open={open === 'view'}
            onOpenChange={closeWithRow}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  )
}
