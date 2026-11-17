import { useRef } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useDecideJoinRequestMutation } from '../api/queries'
import { type App, type JoinRequest } from '../data/app-schema'
import { joinRequestDecisionError } from '../data/errors'
import { useApps } from './apps-provider'

type Props = {
  app: App
  request: JoinRequest
  decision: 'approve' | 'reject'
  /** `success` = the decision was recorded; `cancel` = closed without a write. */
  onDone: (result: 'success' | 'cancel') => void
}

// POST /api/v1/apps/{key}/join-requests/{request_id}/approve|reject —
// admin:roles:assign. Never optimistic (R9): the row leaves the list only after
// the refetch. Requester data is rendered as text and never leaves the dialog.
export function AppJoinRequestDecisionDialog({
  app,
  request,
  decision,
  onDone,
}: Props) {
  const { api } = useApps()
  const mutation = useDecideJoinRequestMutation(app.key, decision, api)
  const inFlight = useRef(false)
  const approve = decision === 'approve'

  const handleConfirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate(request.id, {
      onSuccess: () => {
        toast.success(
          approve ? 'Join request approved.' : 'Join request rejected.'
        )
        onDone('success')
      },
      onSettled: () => {
        inFlight.current = false
      },
    })
  }

  const failure = mutation.isError
    ? joinRequestDecisionError(mutation.error)
    : null
  const who = request.display_name ? (
    <>
      {request.display_name} ({request.email})
    </>
  ) : (
    request.email
  )

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (next || mutation.isPending) return
        mutation.reset()
        onDone('cancel')
      }}
      handleConfirm={handleConfirm}
      isLoading={mutation.isPending}
      pendingText={approve ? 'Approving…' : 'Rejecting…'}
      destructive={!approve}
      title={approve ? 'Approve join request?' : 'Reject join request?'}
      desc={
        approve ? (
          <>
            Approve {who} to join {app.name} ({app.key})? If they aren&apos;t a
            member yet, they get the app&apos;s default role, app-wide. If they
            already have a role in this app, nothing else changes.
          </>
        ) : (
          <>
            Reject the request from {who} to join {app.name} ({app.key})? They
            can&apos;t request to join this app again for a while. This
            can&apos;t be undone here.
          </>
        )
      }
      confirmText={approve ? 'Approve' : 'Reject'}
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
