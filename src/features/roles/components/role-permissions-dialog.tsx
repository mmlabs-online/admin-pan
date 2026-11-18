import { useEffect, useId, useRef, useState } from 'react'
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
import { message, type AppAlert } from '@/features/apps/data/errors'
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
  const reasonId = useId()
  const saveRef = useRef<HTMLButtonElement>(null)
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null)
  const alertBox = useRef<HTMLDivElement>(null)
  // The role's permissions when the confirm step was shown (sorted).
  const confirmBase = useRef<string[] | null>(null)
  const prevPhase = useRef<'edit' | 'confirm'>('edit')
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

  const loadError =
    view.status === 'error'
      ? isApiError(view.error, 404)
        ? 'This role no longer exists.'
        : "Couldn't load this role."
      : permsQ.isError
        ? "Couldn't load the app's permission list."
        : null
  const reset = () => {
    confirmBase.current = null
    setEdit(null)
    setPhase('edit')
    setAlert(null)
    replace.reset()
  }

  const send = async () => {
    if (inFlight.current || !ready || loadError) return
    if (
      phase === 'confirm' &&
      [...(base ?? [])].sort().join('\n') !== confirmBase.current?.join('\n')
    ) {
      setPhase('edit')
      setAlert(
        message(
          'This role changed while you were reviewing. Check the selection and save again.'
        )
      )
      return
    }
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
    if (removed.length) {
      confirmBase.current = [...(base ?? [])].sort()
      setPhase('confirm')
    } else void send()
  }

  const forbidden = view.status === 'forbidden'
  const waiting = !loadError && !forbidden && !ready && !overLimit
  const reason = overLimit
    ? `A role can hold at most ${PERMISSION_KEYS_MAX} permissions.`
    : waiting
      ? 'Loading…'
      : null
  const pending = replace.isPending
  const confirmBlocked = pending || !ready || Boolean(loadError)
  const confirmReason = pending
    ? 'Saving…'
    : (loadError ??
      (forbidden
        ? 'You no longer have access to this role.'
        : waiting
          ? 'Loading…'
          : null))

  // Announce a step change by moving focus (the heading names the step).
  useEffect(() => {
    if (prevPhase.current === phase) return
    prevPhase.current = phase
    if (phase === 'confirm') confirmHeadingRef.current?.focus()
    else if (alert) alertBox.current?.focus()
    else saveRef.current?.focus()
    // Only a phase change moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

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
            <h3
              ref={confirmHeadingRef}
              tabIndex={-1}
              className='font-medium outline-none'
            >
              Remove these permissions from {currentRow.key}?
            </h3>
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
        <div ref={alertBox} tabIndex={-1} className='outline-none'>
          <RoleAlertView alert={alert} />
        </div>
        <p role='status' aria-live='polite' className='sr-only'>
          {pending
            ? 'Saving permissions…'
            : waiting
              ? 'Loading permissions…'
              : ''}
        </p>
        {readOnly && (
          <p className='text-sm text-muted-foreground'>
            You can view these permissions but not change them. Changing them
            needs admin:roles:manage.
          </p>
        )}
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
                {confirmBlocked && confirmReason && (
                  <span
                    id={reasonId}
                    className='me-auto self-center text-sm text-muted-foreground'
                  >
                    {confirmReason}
                  </span>
                )}
                <Button
                  type='button'
                  variant='destructive'
                  aria-disabled={confirmBlocked || undefined}
                  aria-describedby={
                    confirmBlocked && confirmReason ? reasonId : undefined
                  }
                  className={confirmBlocked ? 'opacity-50' : undefined}
                  onClick={() => void send()}
                >
                  {pending ? 'Saving…' : 'Remove and save'}
                </Button>
              </>
            ) : (
              <>
                {reason && (
                  <span
                    id={reasonId}
                    className='me-auto self-center text-sm text-muted-foreground'
                  >
                    {reason}
                  </span>
                )}
                <Button
                  ref={saveRef}
                  type='button'
                  aria-disabled={!ready || undefined}
                  aria-describedby={reason ? reasonId : undefined}
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
