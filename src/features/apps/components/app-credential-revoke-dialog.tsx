import { useRef } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useRevokeCredentialMutation } from '../api/queries'
import { type App, type AppCredential } from '../data/app-schema'
import { credentialRevokeError } from '../data/errors'
import { useApps } from './apps-provider'

type AppCredentialRevokeDialogProps = {
  app: App
  credential: AppCredential
  /** `success` = the credential was revoked; `cancel` = closed without a write. */
  onDone: (result: 'success' | 'cancel') => void
}

// DELETE /api/v1/apps/{key}/credentials/{credential_id} — admin:apps:write.
// The path takes the row `id`, not the `key_id`. Never optimistic (R9): the
// row changes only after the list refetch.
export function AppCredentialRevokeDialog({
  app,
  credential,
  onDone,
}: AppCredentialRevokeDialogProps) {
  const { api } = useApps()
  const revoke = useRevokeCredentialMutation(app.key, api)
  const inFlight = useRef(false)

  const handleConfirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    revoke.mutate(credential.id, {
      onSuccess: () => {
        toast.success(`Credential ${credential.key_id} revoked.`)
        onDone('success')
      },
      onSettled: () => {
        inFlight.current = false
      },
    })
  }

  const failure = revoke.isError ? credentialRevokeError(revoke.error) : null

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (next || revoke.isPending) return
        revoke.reset()
        onDone('cancel')
      }}
      handleConfirm={handleConfirm}
      isLoading={revoke.isPending}
      pendingText='Revoking…'
      destructive
      title='Revoke credential?'
      desc={
        <>
          Revoke credential{' '}
          <span className='font-mono'>{credential.key_id}</span> of {app.name} (
          {app.key})? It stops working immediately and can&apos;t be restored.
          Anything that still uses it will be refused.
        </>
      }
      confirmText='Revoke'
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
