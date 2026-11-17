import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { queryView } from '@/lib/query-view'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { Can } from '@/components/permissions/can'
import {
  PERMISSIONS_PAGE_SIZE,
  appPermissionsQueryOptions,
} from '../api/queries'
import { ADMIN_APP_KEY, type App, type Permission } from '../data/app-schema'
import { permissionScopeLabels } from '../data/data'
import { AppPermissionAdminDialog } from './app-permission-admin-dialog'
import { AppPermissionFormDialog } from './app-permission-form-dialog'
import { useApps } from './apps-provider'

// GET /api/v1/apps/{key}/permissions — admin:apps:read. Mounted only while its
// tab is selected, so nothing is fetched before then.
export function AppPermissionsTab({ app }: { app: App }) {
  const { api } = useApps()
  const [offset, setOffset] = useState(0)
  const [adding, setAdding] = useState(false)
  const [toggle, setToggle] = useState<Permission | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  // The confirm dialog is an AlertDialog without a close-focus hook: focus the
  // switch that opened it in an effect, after the dialog has unmounted (R10).
  const switchToFocus = useRef<string | null>(null)
  useEffect(() => {
    if (toggle === null && switchToFocus.current) {
      document
        .querySelector<HTMLElement>(
          `[aria-label="Admin only: ${switchToFocus.current}"]`
        )
        ?.focus()
      switchToFocus.current = null
    }
  }, [toggle])
  const q = useQuery(
    appPermissionsQueryOptions(
      app.key,
      { limit: PERMISSIONS_PAGE_SIZE, offset },
      api
    )
  )
  const view = queryView(q)
  const isAdminApp = app.key === ADMIN_APP_KEY

  const total = q.data?.total ?? 0
  const from = total ? offset + 1 : 0
  const to = Math.min(offset + PERMISSIONS_PAGE_SIZE, total)

  return (
    <div className='space-y-4 pt-2'>
      <div className='flex items-start justify-between gap-2'>
        <div className='space-y-1 text-sm text-muted-foreground'>
          <p>
            Admin-only permissions can&apos;t be held by the app&apos;s default
            role.
          </p>
          {isAdminApp && (
            <p>
              Admin app permissions are always admin only; changing them needs
              admin:*.
            </p>
          )}
          {app.org_mode === 'required' && (
            <p>
              New permissions are org-scoped unless their key is reserved
              (ADR-0015).
            </p>
          )}
        </div>
        <Can action='apps.createPermission' disable>
          {({ disabled, describedBy }) => (
            <Button
              ref={addButton}
              size='sm'
              disabled={disabled}
              aria-describedby={describedBy}
              onClick={() => setAdding(true)}
            >
              <Plus className='size-4' aria-hidden='true' />
              Add permission
            </Button>
          )}
        </Can>
      </div>

      {view.status === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={view.copy} />
      ) : view.status === 'pending' ? (
        <p role='status'>Loading permissions…</p>
      ) : view.status === 'error' ? (
        <div role='alert' className='space-y-2 text-sm'>
          <p>Couldn&apos;t load permissions.</p>
          <Button size='sm' onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className='overflow-x-auto rounded-md border'>
            <Table aria-label={`Permissions of ${app.key}`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>Key</TableHead>
                  <TableHead scope='col'>Description</TableHead>
                  <TableHead scope='col'>Scope</TableHead>
                  <TableHead scope='col' className='text-end'>
                    Admin only
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.data.items.length ? (
                  view.data.items.map((permission) => (
                    <PermissionRow
                      key={permission.id}
                      app={app}
                      permission={permission}
                      onToggle={() => setToggle(permission)}
                    />
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className='h-16 text-center'>
                      No permissions yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {total > PERMISSIONS_PAGE_SIZE && (
            <div className='flex items-center justify-between gap-2'>
              <p role='status' aria-live='polite' className='text-sm'>
                Showing {from}–{to} of {total}
              </p>
              <div className='flex gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={offset === 0}
                  onClick={() =>
                    setOffset((o) => Math.max(0, o - PERMISSIONS_PAGE_SIZE))
                  }
                >
                  Previous
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={to >= total}
                  onClick={() => setOffset((o) => o + PERMISSIONS_PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AppPermissionFormDialog
        app={app}
        open={adding}
        onOpenChange={setAdding}
        returnFocus={() => addButton.current?.focus()}
      />
      {toggle && (
        <AppPermissionAdminDialog
          app={app}
          permission={toggle}
          open
          onOpenChange={() => {
            switchToFocus.current = toggle.key
            setToggle(null)
          }}
        />
      )}
    </div>
  )
}

function PermissionRow({
  app,
  permission,
  onToggle,
}: {
  app: App
  permission: Permission
  onToggle: () => void
}) {
  const lockedId = useId()
  // The API refuses to clear `is_admin` on `<app>:*` and on admin-app
  // permissions (422); the switch mirrors that (R4: advisory only).
  const locked = app.key === ADMIN_APP_KEY || permission.key === `${app.key}:*`
  return (
    <TableRow>
      <TableCell className='font-mono text-sm'>{permission.key}</TableCell>
      <TableCell className='whitespace-normal'>
        {permission.description ?? (
          <span className='text-muted-foreground'>No description</span>
        )}
      </TableCell>
      <TableCell>{permissionScopeLabels[permission.scope]}</TableCell>
      <TableCell className='text-end'>
        {locked ? (
          <>
            <Switch
              checked
              disabled
              aria-label={`Admin only: ${permission.key}`}
              aria-describedby={lockedId}
            />
            <span id={lockedId} className='sr-only'>
              Always admin only
            </span>
          </>
        ) : (
          <Can action='apps.updatePermission' disable>
            {({ disabled, describedBy }) => (
              <Switch
                checked={permission.is_admin}
                disabled={disabled}
                aria-describedby={describedBy}
                aria-label={`Admin only: ${permission.key}`}
                onCheckedChange={onToggle}
              />
            )}
          </Can>
        )}
      </TableCell>
    </TableRow>
  )
}
