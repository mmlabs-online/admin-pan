import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isApiError } from '@/api'
import { toast } from 'sonner'
import { queryView } from '@/lib/query-view'
import { useActionPermission } from '@/context/permission-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { ADMIN_APP_KEY, type App } from '@/features/apps/data/app-schema'
import { type AppAlert } from '@/features/apps/data/errors'
import {
  appAllPermissionsQueryOptions,
  roleDefinitionQueryOptions,
  useReplaceRolePermissionsMutation,
} from '../api/queries'
import { rolePermissionsError } from '../data/errors'
import {
  PERMISSION_KEYS_MAX,
  SUPER_ADMIN_ROLE_KEY,
  type RoleDefinition,
} from '../data/role-schema'
import { RoleAlertView } from './role-alert-view'
import { RolePermissionPicker } from './role-permission-picker'
import { useRoles } from './roles-provider'

type RolePermissionsDialogProps = {
  app: App
  currentRow: RoleDefinition
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: () => void
}

// PUT /api/v1/apps/{key}/roles/{role_id}/permissions { permission_keys } — a
// FULL replace. So Save waits for the role's fresh detail and for every page
// of the app's permissions: a half-loaded picker would silently drop keys.
export function RolePermissionsDialog({
  app,
  currentRow,
  open,
  onOpenChange,
  returnFocus,
}: RolePermissionsDialogProps) {
  const { api } = useRoles()
  const readOnly = useActionPermission('roles.setPermissions') === 'denied'
  const roleQ = useQuery({
    ...roleDefinitionQueryOptions(app.key, currentRow.id, api),
    placeholderData: currentRow,
    enabled: open,
  })
  const permsQ = useQuery({
    ...appAllPermissionsQueryOptions(app.key, api),
    enabled: open,
  })
  const replace = useReplaceRolePermissionsMutation(app.key, api)
  const inFlight = useRef(false)
  // The user's edits; null while untouched, so the selection follows the
  // fetched detail until the first change.
  const [edit, setEdit] = useState<Set<string> | null>(null)
  const [phase, setPhase] = useState<'edit' | 'confirm'>('edit')
  const [alert, setAlert] = useState<AppAlert | null>(null)

  const view = queryView(roleQ)
  const fresh = roleQ.isSuccess && !roleQ.isPlaceholderData && !roleQ.isFetching
  const base = fresh ? roleQ.data.permissions : null
  const selected = edit ?? new Set(base ?? [])
  const overLimit = selected.size > PERMISSION_KEYS_MAX
  const ready = fresh && permsQ.isSuccess && !overLimit
  const held = new Set(base ?? [])
  const added = [...selected].filter((k) => !held.has(k))
  const removed = [...held].filter((k) => !selected.has(k)).sort()
  const isAdminApp = app.key === ADMIN_APP_KEY

  const reset = () => {
    setEdit(null)
    setPhase('edit')
    setAlert(null)
    replace.reset()
  }

  const send = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setAlert(null)
    try {
      await replace.mutateAsync({
        roleId: currentRow.id,
        keys: [...selected].sort(),
      })
    } catch (error) {
      setPhase('edit')
      setAlert(rolePermissionsError(error))
      return
    } finally {
      inFlight.current = false
    }
    toast.success(`Permissions of ${currentRow.key} saved.`)
    reset()
    onOpenChange(false)
  }

  const save = () => {
    if (!ready) return
    if (!added.length && !removed.length) {
      reset()
      onOpenChange(false)
      return
    }
    if (removed.length) setPhase('confirm')
    else void send()
  }

  const loadError =
    view.status === 'error'
      ? isApiError(view.error, 404)
        ? 'This role no longer exists.'
        : "Couldn't load this role."
      : permsQ.isError
        ? "Couldn't load the app's permission list."
        : null
  const waiting = !loadError && !ready && !overLimit
  const reason = overLimit
    ? `A role can hold at most ${PERMISSION_KEYS_MAX} permissions.`
    : waiting
      ? 'Loading…'
      : null
  const pending = replace.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state && pending) return
        reset()
        onOpenChange(state)
      }}
    >
      <DialogContent
        className='sm:max-w-xl'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        <DialogHeader className='text-start'>
          <DialogTitle>Permissions of {currentRow.key}</DialogTitle>
          <DialogDescription>
            {currentRow.name} in {app.name} ({app.key}).
          </DialogDescription>
        </DialogHeader>
        {isAdminApp && (
          <p className='text-sm text-muted-foreground'>
            Changes to the admin app&apos;s roles need the admin:* permission.
            Permission changes apply to everyone holding the role on their next
            request.
          </p>
        )}
        {currentRow.key === SUPER_ADMIN_ROLE_KEY && (
          <p className='text-sm text-muted-foreground'>
            This role must keep admin:*.
          </p>
        )}
        {view.status === 'forbidden' ? (
          <ForbiddenPanel variant='inline' copy={view.copy} />
        ) : loadError ? (
          <div role='alert' className='space-y-2 text-sm'>
            <p>{loadError}</p>
            {!(view.status === 'error' && isApiError(view.error, 404)) && (
              <Button
                size='sm'
                type='button'
                onClick={() => {
                  void roleQ.refetch()
                  void permsQ.refetch()
                }}
              >
                Retry
              </Button>
            )}
          </div>
        ) : phase === 'confirm' ? (
          <div className='space-y-2 text-sm'>
            <p>Remove these permissions from {currentRow.key}?</p>
            <ul className='list-disc ps-5 font-mono'>
              {removed.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <p>
              Everyone holding {currentRow.key} loses these on their next
              request.
            </p>
            {isAdminApp && <p>This can reduce staff access to this console.</p>}
          </div>
        ) : (
          <RolePermissionPicker
            appKey={app.key}
            roleKey={currentRow.key}
            permissions={permsQ.data ?? []}
            selected={selected}
            onChange={setEdit}
            disabled={readOnly || !ready || pending}
          />
        )}
        <RoleAlertView alert={alert} />
        <p role='status' aria-live='polite' className='sr-only'>
          {pending ? 'Saving permissions…' : ''}
        </p>
        {!readOnly && (
          <DialogFooter>
            {phase === 'confirm' ? (
              <>
                <Button
                  type='button'
                  variant='outline'
                  aria-disabled={pending || undefined}
                  onClick={() => {
                    if (!pending) setPhase('edit')
                  }}
                >
                  Back
                </Button>
                <Button
                  type='button'
                  variant='destructive'
                  aria-disabled={pending || undefined}
                  className={pending ? 'opacity-50' : undefined}
                  onClick={() => void send()}
                >
                  {pending ? 'Saving…' : 'Remove and save'}
                </Button>
              </>
            ) : (
              <>
                {reason && (
                  <span className='me-auto self-center text-sm text-muted-foreground'>
                    {reason}
                  </span>
                )}
                <Button
                  type='button'
                  aria-disabled={!ready || undefined}
                  className={!ready ? 'opacity-50' : undefined}
                  onClick={save}
                >
                  Save
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
