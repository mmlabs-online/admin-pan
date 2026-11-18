import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { toast } from 'sonner'
import {
  useActionPermission,
  usePermissionSource,
  useSelfUserId,
} from '@/context/permission-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { ADMIN_APP_KEY } from '@/features/apps/data/app-schema'
import { organizationQueryOptions } from '@/features/organizations/api/queries'
import { roleDefinitionQueryOptions } from '@/features/roles/api/queries'
import { SUPER_ADMIN_ROLE_KEY } from '@/features/roles/data/role-schema'
import { useRevokeAssignmentMutation } from '../api/queries'
import {
  assignmentEffect,
  scopeLabel,
  type Assignment,
} from '../data/assignments'
import { userLabel } from '../data/data'
import { revokeAssignmentError } from '../data/errors'
import { type User } from '../data/schema'

type Props = {
  api: ApiClient
  user: User
  assignment: Assignment
  /** `gone` = the API answered 404; the hook already refetched. */
  onDone: (result: 'success' | 'cancel' | 'gone') => void
}

// DELETE /api/v1/users/{id}/role-assignments/{assignment_id} — admin:roles:assign.
// Never optimistic (R9). The role and org names are looked up without blocking:
// a failed lookup falls back to the key or id. No email in the toast (R5).
export function RoleAssignmentRevokeDialog({
  api,
  user,
  assignment,
  onDone,
}: Props) {
  const revoke = useRevokeAssignmentMutation(api)
  const inFlight = useRef(false)
  const source = usePermissionSource()
  const selfId = useSelfUserId()
  const orgsPermission = useActionPermission('organizations.view')
  const roleQ = useQuery(
    roleDefinitionQueryOptions(assignment.app, assignment.role_id, api)
  )
  const orgQ = useQuery({
    ...organizationQueryOptions(assignment.org_id ?? '', api),
    enabled: assignment.org_id !== null && orgsPermission !== 'denied',
  })
  const role = roleQ.data
  const needsWildcard =
    !!role?.privileged && source.check('admin:*') === 'denied'
  const isSelf =
    assignment.app === ADMIN_APP_KEY &&
    selfId !== undefined &&
    selfId.toLowerCase() === user.id.toLowerCase()
  const blocked = needsWildcard || isSelf

  const handleConfirm = () => {
    if (inFlight.current || blocked) return
    inFlight.current = true
    revoke.mutate(
      { userId: user.id, app: assignment.app, assignmentId: assignment.id },
      {
        onSuccess: () => {
          toast.success(
            `Role ${assignment.role_key} revoked in ${assignment.app}.`
          )
          onDone('success')
        },
        onError: (error) => {
          if (revokeAssignmentError(error).kind === 'gone') onDone('gone')
        },
        onSettled: () => {
          inFlight.current = false
        },
      }
    )
  }

  const failure = revoke.isError ? revokeAssignmentError(revoke.error) : null
  const reason = isSelf
    ? "You can't change your own admin roles."
    : needsWildcard
      ? 'Needs admin:*.'
      : null

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
      // ConfirmDialog has no aria-disabled option; the reason is visible text.
      disabled={blocked}
      title={`Revoke ${assignment.role_key}?`}
      desc={
        <>
          Revoke <bdi>{role?.name ?? assignment.role_key}</bdi> (
          {assignment.role_key}) in {assignment.app} from{' '}
          <bdi>{userLabel(user)}</bdi> (<bdi>{user.email}</bdi>) — scope:{' '}
          <bdi>{scopeLabel(assignment.org_id, orgQ.data?.name)}</bdi>?{' '}
          {assignmentEffect(assignment.app)}
          {assignment.role_key === SUPER_ADMIN_ROLE_KEY &&
            ' The API refuses to revoke the last active super admin.'}
        </>
      }
      confirmText='Revoke role'
      error={
        failure?.kind === 'forbidden' ? (
          <ForbiddenPanel variant='inline' copy={failure.copy} />
        ) : failure?.kind === 'message' ? (
          <p role='alert' className='text-sm text-destructive'>
            {failure.text}
          </p>
        ) : reason ? (
          <p className='text-sm text-muted-foreground'>{reason}</p>
        ) : undefined
      }
    />
  )
}
