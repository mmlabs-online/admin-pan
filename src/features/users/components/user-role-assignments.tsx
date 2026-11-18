import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryView } from '@/lib/query-view'
import {
  useActionPermission,
  usePermissionSource,
  useSelfUserId,
} from '@/context/permission-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { ADMIN_APP_KEY } from '@/features/apps/data/app-schema'
import {
  ASSIGNMENTS_PAGE_SIZE,
  userRoleAssignmentsQueryOptions,
} from '../api/queries'
import { assignmentEffect, type Assignment } from '../data/assignments'
import { formatDateTimeZone } from '../data/data'
import { type User } from '../data/schema'
import { RoleAssignDialog } from './role-assign-dialog'
import { RoleAssignmentRevokeDialog } from './role-assignment-revoke-dialog'
import { useUsers } from './users-provider'

type Dialog = { kind: 'assign' } | { kind: 'revoke'; assignment: Assignment }
type FocusAfter =
  | { kind: 'row'; id: string }
  | { kind: 'assign' }
  | { kind: 'heading' }

const GONE_NOTICE =
  'This assignment no longer exists; it may already have been revoked. The list was refreshed.'

const SELF_REASON = "You can't change your own admin roles"
const WILDCARD_REASON = 'Needs admin:*'

/**
 * "Apps & roles" of the user sheet: `GET /api/v1/users/{id}/role-assignments`
 * (admin:users:read), assign and revoke (admin:roles:assign). `active` means
 * "not expired" only. The self and admin:* hints are advisory (R4).
 */
export function UserRoleAssignments({
  user,
  open,
}: {
  user: User
  open: boolean
}) {
  const { api } = useUsers()
  const headingId = useId()
  const selfId = useSelfUserId()
  const source = usePermissionSource()
  const canRevoke = useActionPermission('roles.revoke') !== 'denied'
  const [offset, setOffset] = useState(0)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const assignButton = useRef<HTMLButtonElement>(null)
  // Refs by assignment id, never a selector built from API data.
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const focusAfter = useRef<FocusAfter | null>(null)
  useEffect(() => {
    if (dialog !== null || !focusAfter.current) return
    const target = focusAfter.current
    focusAfter.current = null
    const el =
      target.kind === 'row'
        ? buttons.current.get(target.id)
        : target.kind === 'assign'
          ? assignButton.current
          : null
    if (el?.isConnected) el.focus()
    else heading.current?.focus()
  }, [dialog])

  const q = useQuery({
    ...userRoleAssignmentsQueryOptions(
      user.id,
      { limit: ASSIGNMENTS_PAGE_SIZE, offset },
      api
    ),
    enabled: open,
  })
  const view = queryView(q)
  const settled = q.isSuccess && !q.isPlaceholderData

  // After the last row of the last page is revoked, step back to a page that
  // exists (React re-renders at once; no effect needed).
  if (settled && offset !== 0 && !q.data.items.length) {
    const target =
      q.data.total > 0
        ? Math.floor((q.data.total - 1) / ASSIGNMENTS_PAGE_SIZE) *
          ASSIGNMENTS_PAGE_SIZE
        : 0
    if (target !== offset) setOffset(target)
  }

  const total = q.data?.total ?? 0
  const from = total ? offset + 1 : 0
  const to = Math.min(offset + ASSIGNMENTS_PAGE_SIZE, total)
  const isSelf =
    selfId !== undefined && selfId.toLowerCase() === user.id.toLowerCase()
  const revokeReason = (a: Assignment) =>
    a.app !== ADMIN_APP_KEY
      ? null
      : isSelf
        ? SELF_REASON
        : source.check('admin:*') === 'denied'
          ? WILDCARD_REASON
          : null
  const openDialog = (next: Dialog) => {
    setNotice(null)
    setDialog(next)
  }

  return (
    <section aria-labelledby={headingId} className='space-y-2'>
      <div className='flex items-start justify-between gap-2'>
        <h3 id={headingId} ref={heading} tabIndex={-1} className='font-medium'>
          Apps &amp; roles
        </h3>
        <Can action='roles.assign'>
          <Button
            ref={assignButton}
            size='sm'
            variant='outline'
            onClick={() => openDialog({ kind: 'assign' })}
          >
            Assign role
          </Button>
        </Can>
      </div>
      <p role='status' className='text-sm'>
        {notice}
      </p>
      {view.status === 'pending' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          Loading role assignments…
        </p>
      ) : view.status === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={view.copy} />
      ) : view.status === 'error' ? (
        <div role='alert' className='space-y-2 text-sm'>
          <p>Couldn&apos;t load role assignments.</p>
          <Button size='sm' onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : view.data.items.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No role assignments.</p>
      ) : (
        <>
          <div className='rounded-md border'>
            <Table aria-labelledby={headingId}>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>App</TableHead>
                  <TableHead scope='col'>Role</TableHead>
                  <TableHead scope='col'>Scope</TableHead>
                  <TableHead scope='col'>Expires</TableHead>
                  <TableHead scope='col'>Status</TableHead>
                  {canRevoke && (
                    <TableHead scope='col' className='text-end'>
                      <span className='sr-only'>Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.data.items.map((a) => {
                  const reason = revokeReason(a)
                  const disabled = q.isPlaceholderData || reason !== null
                  return (
                    <TableRow key={a.id}>
                      <TableCell>{a.app}</TableCell>
                      <TableCell>{a.role_key}</TableCell>
                      <TableCell className='break-all'>
                        {a.org_id === null ? (
                          'App-wide'
                        ) : (
                          <code className='text-xs'>{a.org_id}</code>
                        )}
                      </TableCell>
                      <TableCell>
                        {a.expires_at
                          ? formatDateTimeZone(a.expires_at)
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.active ? 'secondary' : 'outline'}>
                          {a.active ? 'Not expired' : 'Expired'}
                        </Badge>
                      </TableCell>
                      {canRevoke && (
                        <TableCell className='text-end whitespace-normal'>
                          <Can action='roles.revoke'>
                            <Button
                              size='sm'
                              variant='outline'
                              className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
                              aria-label={`Revoke ${a.role_key} in ${a.app}`}
                              aria-disabled={disabled}
                              aria-describedby={
                                reason ? `${headingId}-${a.id}` : undefined
                              }
                              ref={(el) => {
                                if (el) buttons.current.set(a.id, el)
                                else buttons.current.delete(a.id)
                              }}
                              onClick={() => {
                                if (disabled) return
                                openDialog({ kind: 'revoke', assignment: a })
                              }}
                            >
                              Revoke
                            </Button>
                            {reason && (
                              <span
                                id={`${headingId}-${a.id}`}
                                className='block text-xs text-muted-foreground'
                              >
                                {reason}
                              </span>
                            )}
                          </Can>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {total > ASSIGNMENTS_PAGE_SIZE && (
            <div className='flex items-center justify-between gap-2'>
              <p role='status' aria-live='polite' className='text-sm'>
                Showing {from}–{to} of {total}
              </p>
              <div className='flex gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
                  aria-disabled={offset === 0}
                  onClick={() => {
                    if (offset === 0) return
                    setOffset((o) => Math.max(0, o - ASSIGNMENTS_PAGE_SIZE))
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
                    setOffset((o) => o + ASSIGNMENTS_PAGE_SIZE)
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {dialog?.kind === 'assign' && (
        <RoleAssignDialog
          api={api}
          target={{ kind: 'user', user }}
          onDone={(r) => {
            if (r.result === 'success') {
              focusAfter.current = { kind: 'heading' }
              setOffset(0)
              setNotice(
                `Granted ${r.roleKey} in ${r.app}. ${assignmentEffect(r.app)}`
              )
            } else focusAfter.current = { kind: 'assign' }
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <RoleAssignmentRevokeDialog
          api={api}
          user={user}
          assignment={dialog.assignment}
          onDone={(result) => {
            const { assignment } = dialog
            focusAfter.current =
              result === 'cancel'
                ? { kind: 'row', id: assignment.id }
                : { kind: 'heading' }
            if (result === 'success')
              setNotice(
                `Revoked ${assignment.role_key} in ${assignment.app}. ${assignmentEffect(assignment.app)}`
              )
            if (result === 'gone') setNotice(GONE_NOTICE)
            setDialog(null)
          }}
        />
      )}
    </section>
  )
}
