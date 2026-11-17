import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryView } from '@/lib/query-view'
import { useSelfUserId } from '@/context/permission-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  JOIN_REQUESTS_PAGE_SIZE,
  appJoinRequestsQueryOptions,
  type JoinRequestStatus,
} from '../api/queries'
import { type App, type JoinRequest } from '../data/app-schema'
import {
  formatDate,
  joinPolicyLabels,
  joinRequestStatusLabel,
  joinRequestStatusOptions,
  requesterLabel,
} from '../data/data'
import { AppJoinRequestDecisionDialog } from './app-join-request-decision-dialog'
import { useApps } from './apps-provider'

type Decision = 'approve' | 'reject'

// GET /api/v1/apps/{key}/join-requests — admin:users:read. Mounted only while
// its tab is selected. Requester names and emails are text only (R5, R6).
export function AppJoinRequestsTab({ app }: { app: App }) {
  const { api } = useApps()
  const selfId = useSelfUserId()
  const statusId = useId()
  const [status, setStatus] = useState<JoinRequestStatus>('pending')
  const [offset, setOffset] = useState(0)
  const [deciding, setDeciding] = useState<{
    request: JoinRequest
    decision: Decision
  } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // Refs by row id and decision, never a selector built from API data.
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const focusAfter = useRef<
    { kind: 'row'; key: string } | { kind: 'heading' } | null
  >(null)
  useEffect(() => {
    if (deciding !== null || !focusAfter.current) return
    const target = focusAfter.current
    focusAfter.current = null
    const el = target.kind === 'row' ? buttons.current.get(target.key) : null
    if (el?.isConnected) el.focus()
    else heading.current?.focus()
  }, [deciding])

  const q = useQuery(
    appJoinRequestsQueryOptions(
      app.key,
      { status, limit: JOIN_REQUESTS_PAGE_SIZE, offset },
      api
    )
  )
  const view = queryView(q)

  // After the last row of the last page is decided, step back to a page that
  // exists (React re-renders at once; no effect needed).
  if (q.isSuccess && offset !== 0 && !q.data.items.length) {
    const target =
      q.data.total > 0
        ? Math.floor((q.data.total - 1) / JOIN_REQUESTS_PAGE_SIZE) *
          JOIN_REQUESTS_PAGE_SIZE
        : 0
    if (target !== offset) setOffset(target)
  }

  const total = q.data?.total ?? 0
  const from = total ? offset + 1 : 0
  const to = Math.min(offset + JOIN_REQUESTS_PAGE_SIZE, total)
  const pending = status === 'pending'

  const actionButton = (r: JoinRequest, decision: Decision) => {
    const label = requesterLabel(r)
    const key = `${r.id}:${decision}`
    return (
      <Button
        size='sm'
        variant='outline'
        aria-label={`${decision === 'approve' ? 'Approve' : 'Reject'} ${label}`}
        ref={(el) => {
          if (el) buttons.current.set(key, el)
          else buttons.current.delete(key)
        }}
        onClick={() => setDeciding({ request: r, decision })}
      >
        {decision === 'approve' ? 'Approve' : 'Reject'}
      </Button>
    )
  }

  return (
    <div className='space-y-4 pt-2'>
      <div className='space-y-1'>
        <h3 ref={heading} tabIndex={-1} className='text-sm font-medium'>
          Join requests
        </h3>
        <p className='text-sm text-muted-foreground'>
          People who asked to join {app.name}. Approving gives them the
          app&apos;s default role, app-wide.
        </p>
        {app.join_policy !== 'approval' && (
          <p className='text-sm text-muted-foreground'>
            This app&apos;s join policy is {joinPolicyLabels[app.join_policy]},
            so no new requests are created. Requests already listed can still be
            rejected; approving them will be refused.
          </p>
        )}
        {app.status === 'disabled' && (
          <p className='text-sm text-muted-foreground'>
            This app is disabled. Approving requests will be refused until it is
            enabled.
          </p>
        )}
      </div>
      <div className='flex items-center gap-2'>
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as JoinRequestStatus)
            setOffset(0)
          }}
        >
          <SelectTrigger id={statusId} size='sm' className='w-40'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {joinRequestStatusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p role='status' aria-live='polite' className='sr-only'>
        {q.isSuccess
          ? `${total} ${status} join ${total === 1 ? 'request' : 'requests'} found.`
          : ''}
      </p>

      {view.status === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={view.copy} />
      ) : view.status === 'pending' ? (
        <p role='status'>Loading join requests…</p>
      ) : view.status === 'error' ? (
        <div role='alert' className='space-y-2 text-sm'>
          <p>Couldn&apos;t load join requests.</p>
          <Button size='sm' onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className='overflow-x-auto rounded-md border'>
            <Table aria-label={`Join requests of ${app.key}`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>Requester</TableHead>
                  <TableHead scope='col'>Requested</TableHead>
                  <TableHead scope='col'>Status</TableHead>
                  {!pending && <TableHead scope='col'>Decided</TableHead>}
                  {pending && (
                    <TableHead scope='col' className='text-end'>
                      <span className='sr-only'>Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.data.items.length ? (
                  view.data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className='max-w-64'>
                        <div className='truncate' title={requesterLabel(r)}>
                          {requesterLabel(r)}
                          {r.user_id === selfId && ' (you)'}
                        </div>
                        {r.display_name?.trim() && (
                          <div
                            className='truncate text-xs text-muted-foreground'
                            title={r.email}
                          >
                            {r.email}
                          </div>
                        )}
                        {(!r.email_verified || r.user_status !== 'active') && (
                          <div className='mt-1 flex flex-wrap gap-1'>
                            {!r.email_verified && (
                              <Badge variant='outline'>
                                Email not verified
                              </Badge>
                            )}
                            {r.user_status !== 'active' && (
                              <Badge variant='outline'>Account disabled</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <time dateTime={r.created_at}>
                          {formatDate(r.created_at)}
                        </time>
                      </TableCell>
                      <TableCell>
                        <Badge variant='secondary'>
                          {joinRequestStatusLabel(r.status)}
                        </Badge>
                      </TableCell>
                      {!pending && (
                        <TableCell>
                          {r.decided_at ? (
                            <time dateTime={r.decided_at}>
                              {formatDate(r.decided_at)}
                            </time>
                          ) : (
                            '—'
                          )}
                          {r.decided_by &&
                            r.decided_by === selfId &&
                            ' (by you)'}
                        </TableCell>
                      )}
                      {pending && (
                        <TableCell className='text-end'>
                          {r.status === 'pending' && (
                            <Can action='apps.decideJoinRequest'>
                              <div className='flex justify-end gap-2'>
                                {actionButton(r, 'approve')}
                                {actionButton(r, 'reject')}
                              </div>
                            </Can>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className='h-16 text-center'>
                      No {status} join requests.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Can
            action='apps.decideJoinRequest'
            fallback={
              <p className='text-sm text-muted-foreground'>
                Approving or rejecting requests needs admin:roles:assign.
              </p>
            }
          >
            {null}
          </Can>
          {total > JOIN_REQUESTS_PAGE_SIZE && (
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
                    setOffset((o) => Math.max(0, o - JOIN_REQUESTS_PAGE_SIZE))
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
                    setOffset((o) => o + JOIN_REQUESTS_PAGE_SIZE)
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {deciding && (
        <AppJoinRequestDecisionDialog
          app={app}
          request={deciding.request}
          decision={deciding.decision}
          onDone={(result) => {
            focusAfter.current =
              result === 'success'
                ? { kind: 'heading' }
                : {
                    kind: 'row',
                    key: `${deciding.request.id}:${deciding.decision}`,
                  }
            setDeciding(null)
          }}
        />
      )}
    </div>
  )
}
