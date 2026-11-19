import { useRef } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import {
  useRevokeAllUserSessionsMutation,
  useRevokeUserSessionMutation,
} from '../api/queries'
import { formatDateTime, userLabel } from '../data/data'
import { sessionRevokeError } from '../data/errors'
import { type User, type UserSession } from '../data/schema'
import { REVOKE_ALL_EFFECT, REVOKE_ONE_EFFECT } from '../data/sessions'
import { useUsers } from './users-provider'

export type RevokeTarget =
  | { kind: 'one'; session: UserSession }
  | { kind: 'all' }

type Props = {
  user: User
  target: RevokeTarget
  /** `gone` = the API answered 404; the hook already refetched. */
  onDone: (result: 'success' | 'cancel' | 'gone') => void
}

// DELETE /api/v1/users/{id}/sessions[/{session_id}] — admin:*. Never optimistic
// (R9). Toasts carry no email, IP, user agent or id (R5).
export function UserSessionRevokeDialog({ user, target, onDone }: Props) {
  const { api } = useUsers()
  const one = useRevokeUserSessionMutation(user.id, api, {
    onSuccess: () => toast.success('Session revoked.'),
  })
  const all = useRevokeAllUserSessionsMutation(user.id, api, {
    onSuccess: () => toast.success('All sessions revoked.'),
  })
  const m = target.kind === 'one' ? one : all
  const inFlight = useRef(false)

  const handleConfirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    const options = {
      onSuccess: () => {
        onDone('success')
      },
      onError: (error: unknown) => {
        if (sessionRevokeError(error).kind === 'gone') onDone('gone')
      },
      onSettled: () => {
        inFlight.current = false
      },
    }
    if (target.kind === 'one') one.mutate(target.session.id, options)
    else all.mutate(undefined, options)
  }

  const failure = m.isError ? sessionRevokeError(m.error) : null
  const who = user.email + (user.display_name ? ` (${userLabel(user)})` : '')

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (next || m.isPending) return
        m.reset()
        onDone('cancel')
      }}
      handleConfirm={handleConfirm}
      isLoading={m.isPending}
      pendingText='Revoking…'
      destructive
      title={
        target.kind === 'one' ? 'Revoke this session?' : 'Revoke all sessions?'
      }
      desc={
        target.kind === 'one' ? (
          <>
            Revoke the session of {who} created{' '}
            {formatDateTime(target.session.created_at)}, last signed in{' '}
            {formatDateTime(target.session.last_used_at)}? {REVOKE_ONE_EFFECT}
          </>
        ) : (
          <>
            Revoke every active session of {who} on every browser?{' '}
            {REVOKE_ALL_EFFECT}
          </>
        )
      }
      confirmText={
        target.kind === 'one' ? 'Revoke session' : 'Revoke all sessions'
      }
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
