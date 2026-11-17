import { useRef } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useUpdateAppMutation } from '../api/queries'
import { ADMIN_APP_KEY, type App } from '../data/app-schema'
import { ADMIN_APP_NOTE } from '../data/data'
import { appStatusError } from '../data/errors'
import { useApps } from './apps-provider'

type AppStatusDialogProps = {
  currentRow: App
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Disable / enable: PATCH /api/v1/apps/{key} { status } — admin:apps:write
// (+ admin:* for the admin app; the API decides). Never optimistic: the dialog
// stays open until the API answers (R9).
export function AppStatusDialog({
  currentRow,
  open,
  onOpenChange,
}: AppStatusDialogProps) {
  const { api } = useApps()
  const mutation = useUpdateAppMutation(api)
  const inFlight = useRef(false)
  const disabling = currentRow.status === 'active'
  const isAdminApp = currentRow.key === ADMIN_APP_KEY

  const handleConfirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate(
      {
        key: currentRow.key,
        body: { status: disabling ? 'disabled' : 'active' },
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success(
            `App ${currentRow.key} ${disabling ? 'disabled' : 'enabled'}.`
          )
        },
        onSettled: () => {
          inFlight.current = false
        },
      }
    )
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return
    if (!next) mutation.reset()
    onOpenChange(next)
  }

  const failure = mutation.isError
    ? appStatusError(mutation.error, currentRow.key)
    : null

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      handleConfirm={handleConfirm}
      isLoading={mutation.isPending}
      pendingText={disabling ? 'Disabling…' : 'Enabling…'}
      destructive={disabling}
      title={`${disabling ? 'Disable' : 'Enable'} app ${currentRow.key}?`}
      desc={
        <div className='space-y-2'>
          <p>
            {disabling ? 'Disable ' : 'Enable '}
            <span className='font-bold'>{currentRow.name}</span> (
            {currentRow.key})?{' '}
            {disabling
              ? "Users can't sign in to it, join it or get new tokens for it, and its browser origins stop being allowed, until it is enabled again. Tokens already issued keep working until they expire."
              : 'Users can sign in to it and get tokens for it again.'}
          </p>
          {isAdminApp && (
            <p>
              {ADMIN_APP_NOTE} The admin app must stay active; the API refuses
              to disable it.
            </p>
          )}
        </div>
      }
      confirmText={disabling ? 'Disable' : 'Enable'}
      error={
        failure?.kind === 'forbidden' ? (
          <ForbiddenPanel variant='inline' copy={failure.copy} />
        ) : failure?.kind === 'message' ? (
          <p role='alert' className='text-sm text-destructive'>
            {failure.text}
          </p>
        ) : undefined
      }
    />
  )
}
