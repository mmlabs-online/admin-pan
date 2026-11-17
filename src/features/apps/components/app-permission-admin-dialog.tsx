import { useRef } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useUpdatePermissionMutation } from '../api/queries'
import { type App, type Permission } from '../data/app-schema'
import { permissionAdminError } from '../data/errors'
import { useApps } from './apps-provider'

type AppPermissionAdminDialogProps = {
  app: App
  permission: Permission
  open: boolean
  onOpenChange: (open: boolean) => void
}

// PATCH /api/v1/apps/{key}/permissions/{id} { is_admin } — admin:roles:manage;
// any is_admin change also needs admin:* (the API decides). The copy claims
// only what the API does: no role is granted or revoked automatically (D9).
export function AppPermissionAdminDialog({
  app,
  permission,
  open,
  onOpenChange,
}: AppPermissionAdminDialogProps) {
  const { api } = useApps()
  const mutation = useUpdatePermissionMutation(app.key, api)
  const inFlight = useRef(false)
  const makeAdmin = !permission.is_admin

  const handleConfirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate(
      { permissionId: permission.id, body: { is_admin: makeAdmin } },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success(
            `${permission.key} is now ${makeAdmin ? 'admin only' : 'available to members'}.`
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

  const failure = mutation.isError ? permissionAdminError(mutation.error) : null

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      handleConfirm={handleConfirm}
      isLoading={mutation.isPending}
      pendingText='Saving…'
      destructive={makeAdmin}
      title={
        makeAdmin
          ? `Make ${permission.key} admin only?`
          : `Allow ${permission.key} for members?`
      }
      desc={
        makeAdmin
          ? `Admin-only permissions can't be held by the app's default role. The API refuses if the default or org owner role holds ${permission.key}, or if a role holding it has assignments. This needs admin:*.`
          : `${permission.key} can then be added to member roles. No role gets it automatically. This needs admin:*.`
      }
      confirmText={makeAdmin ? 'Make admin only' : 'Allow for members'}
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
