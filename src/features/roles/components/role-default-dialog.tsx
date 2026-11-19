import { useRef } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useUpdateAppMutation } from '@/features/apps/api/queries'
import { type App } from '@/features/apps/data/app-schema'
import { roleDefaultError } from '../data/errors'
import { type RoleDefinition } from '../data/role-schema'
import { RoleAlertView } from './role-alert-view'
import { useRoles } from './roles-provider'

type RoleDefaultDialogProps = {
  app: App
  currentRow: RoleDefinition
  open: boolean
  onOpenChange: (open: boolean) => void
}

// PATCH /api/v1/apps/{key} { default_role_id } — admin:apps:write. The badge
// moves only after the refetch (R9). The API's 422 reasons are shown inline.
export function RoleDefaultDialog({
  app,
  currentRow,
  open,
  onOpenChange,
}: RoleDefaultDialogProps) {
  const { api } = useRoles()
  const mutation = useUpdateAppMutation(api, {
    onSuccess: () =>
      toast.success(
        `${currentRow.key} is now the default role of ${app.name}.`
      ),
  })
  const inFlight = useRef(false)

  const handleConfirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate(
      { key: app.key, body: { default_role_id: currentRow.id } },
      {
        onSuccess: () => {
          onOpenChange(false)
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

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      handleConfirm={handleConfirm}
      isLoading={mutation.isPending}
      pendingText='Saving…'
      title={`Make ${currentRow.key} the default role?`}
      desc={
        <div className='space-y-2'>
          <p>
            New members of {app.name} get{' '}
            <span className='font-bold'>{currentRow.name}</span> (
            {currentRow.key}) when they join. Existing assignments don&apos;t
            change.
          </p>
          {currentRow.privileged && (
            <p>
              This role holds admin-only permissions; the API refuses those on a
              default role.
            </p>
          )}
        </div>
      }
      confirmText='Make default'
      error={
        mutation.isError ? (
          <RoleAlertView alert={roleDefaultError(mutation.error, app.key)} />
        ) : undefined
      }
    />
  )
}
