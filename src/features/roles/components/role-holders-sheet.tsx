import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@/api'
import { queryView } from '@/lib/query-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { type App } from '@/features/apps/data/app-schema'
import { RoleAssignDialog } from '@/features/users/components/role-assign-dialog'
import { UserStatusBadge } from '@/features/users/components/user-status-badge'
import { assignmentEffect, scopeLabel } from '@/features/users/data/assignments'
import { formatDateTimeZone } from '@/features/users/data/data'
import {
  HOLDERS_PAGE_SIZE,
  roleHoldersQueryOptions,
  rolesKeys,
} from '../api/queries'
import { type RoleDefinition } from '../data/role-schema'
import { useRoles } from './roles-provider'

type Props = {
  app: App
  role: RoleDefinition
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Radix returns focus only to a `Trigger`; the opener returns it by hand. */
  returnFocus: () => void
}

// Holders of one role — `GET /api/v1/apps/{key}/role-definitions/{role_id}/assignments`
// (admin:users:read). `total` counts assignments, not people; `active` is "not
// expired" only. Emails are text only and never reach keys, URLs or toasts (R5).
export function RoleHoldersSheet({
  app,
  role,
  open,
  onOpenChange,
  returnFocus,
}: Props) {
  const { api } = useRoles()
  const queryClient = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [assigning, setAssigning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const assignButton = useRef<HTMLButtonElement>(null)
  const focusAfter = useRef<'assign' | 'heading' | null>(null)
  useEffect(() => {
    if (assigning || !focusAfter.current) return
    const target = focusAfter.current
    focusAfter.current = null
    if (target === 'assign' && assignButton.current?.isConnected)
      assignButton.current.focus()
    else heading.current?.focus()
  }, [assigning])

  const q = useQuery({
    ...roleHoldersQueryOptions(
      app.key,
      role.id,
      { limit: HOLDERS_PAGE_SIZE, offset },
      api
    ),
    enabled: open,
  })
  const view = queryView(q)
  const gone = view.status === 'error' && isApiError(view.error, 404)
  useEffect(() => {
    if (gone)
      void queryClient.invalidateQueries({ queryKey: rolesKeys.all(app.key) })
  }, [gone, queryClient, app.key])

  const settled = q.isSuccess && !q.isPlaceholderData
  // After the page empties, step back to a page that exists.
  if (settled && offset !== 0 && !q.data.items.length) {
    const target =
      q.data.total > 0
        ? Math.floor((q.data.total - 1) / HOLDERS_PAGE_SIZE) * HOLDERS_PAGE_SIZE
        : 0
    if (target !== offset) setOffset(target)
  }
  const total = q.data?.total ?? 0
  const from = total ? offset + 1 : 0
  const to = Math.min(offset + HOLDERS_PAGE_SIZE, total)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className='w-full gap-0 sm:max-w-2xl'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        <SheetHeader className='text-start'>
          <SheetTitle ref={heading} tabIndex={-1}>
            Assignments of {role.name} ({role.key})
          </SheetTitle>
          <SheetDescription>
            Who holds this role in {app.name}. One user can be listed once per
            organization and once app-wide, so the count is of assignments, not
            people.
          </SheetDescription>
        </SheetHeader>
        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4'>
          <Can action='roles.assign'>
            <Button
              ref={assignButton}
              size='sm'
              variant='outline'
              onClick={() => {
                setNotice(null)
                setAssigning(true)
              }}
            >
              Assign
            </Button>
          </Can>
          <p role='status' className='text-sm'>
            {notice}
          </p>
          <p role='status' aria-live='polite' className='sr-only'>
            {q.isSuccess
              ? `${total} ${total === 1 ? 'assignment' : 'assignments'}`
              : ''}
          </p>
          {view.status === 'forbidden' ? (
            <ForbiddenPanel variant='inline' copy={view.copy} />
          ) : view.status === 'pending' ? (
            <p role='status' className='text-sm text-muted-foreground'>
              Loading assignments…
            </p>
          ) : view.status === 'error' ? (
            <div role='alert' className='space-y-2 text-sm'>
              {gone ? (
                <p>This role or app no longer exists.</p>
              ) : (
                <>
                  <p>Couldn&apos;t load assignments.</p>
                  <Button size='sm' onClick={() => void q.refetch()}>
                    Retry
                  </Button>
                </>
              )}
            </div>
          ) : view.data.items.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No one holds this role.
            </p>
          ) : (
            <>
              <div className='rounded-md border'>
                <Table aria-label={`Assignments of ${role.name} (${role.key})`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope='col'>User</TableHead>
                      <TableHead scope='col'>Scope</TableHead>
                      <TableHead scope='col'>Expires</TableHead>
                      <TableHead scope='col'>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.data.items.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className='whitespace-normal'>
                          <div className='flex flex-wrap items-center gap-x-2'>
                            <bdi className='font-medium'>
                              {h.display_name ?? 'No display name'}
                            </bdi>
                            <UserStatusBadge status={h.user_status} />
                          </div>
                          <bdi className='block text-xs text-muted-foreground'>
                            {h.email}
                          </bdi>
                        </TableCell>
                        <TableCell className='break-all whitespace-normal'>
                          {scopeLabel(h.org_id)}
                        </TableCell>
                        <TableCell>
                          {h.expires_at
                            ? formatDateTimeZone(h.expires_at)
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={h.active ? 'secondary' : 'outline'}>
                            {h.active ? 'Not expired' : 'Expired'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {total > HOLDERS_PAGE_SIZE && (
                <div className='flex items-center justify-between gap-2'>
                  <p role='status' aria-live='polite' className='text-sm'>
                    Showing {from}–{to} of {total} assignments
                  </p>
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
                      aria-disabled={offset === 0}
                      onClick={() => {
                        if (offset === 0) return
                        setOffset((o) => Math.max(0, o - HOLDERS_PAGE_SIZE))
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
                      aria-disabled={to >= total}
                      onClick={() => {
                        if (to >= total) return
                        setOffset((o) => o + HOLDERS_PAGE_SIZE)
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {assigning && (
          <RoleAssignDialog
            api={api}
            target={{ kind: 'role', app, role }}
            onDone={(r) => {
              if (r.result === 'success') {
                focusAfter.current = 'heading'
                setOffset(0)
                setNotice(
                  `Granted ${r.roleKey} in ${r.app}. ${assignmentEffect(r.app)}`
                )
              } else focusAfter.current = 'assign'
              setAssigning(false)
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
