import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { setAppStatus } from '../data/access-store'
import { type App } from '../data/schema'

type AppStatusDialogProps = {
  currentRow: App
  open: boolean
  onOpenChange: (open: boolean) => void
}

// admin:apps:write (planned name)
export function AppStatusDialog({
  currentRow,
  open,
  onOpenChange,
}: AppStatusDialogProps) {
  const disabling = currentRow.status === 'active'

  const handleConfirm = () => {
    setAppStatus(currentRow.id, disabling ? 'disabled' : 'active')
    toast.success(
      `App ${currentRow.key} ${disabling ? 'disabled' : 'enabled'}.`
    )
    onOpenChange(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleConfirm}
      destructive={disabling}
      title={`${disabling ? 'Disable' : 'Enable'} app ${currentRow.key}?`}
      desc={
        disabling
          ? `Users will no longer be able to sign in to ${currentRow.name} (${currentRow.key}) until it is enabled again.`
          : `Users will be able to sign in to ${currentRow.name} (${currentRow.key}) again.`
      }
      confirmText={disabling ? 'Disable' : 'Enable'}
    />
  )
}
