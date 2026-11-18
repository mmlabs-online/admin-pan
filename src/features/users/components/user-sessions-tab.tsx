import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isApiError } from '@/api'
import { queryView } from '@/lib/query-view'
import { useSelfUserId } from '@/context/permission-provider'
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
import { SESSIONS_PAGE_SIZE, userSessionsQueryOptions } from '../api/queries'
import { formatDateTime } from '../data/data'
import { type User, type UserSession } from '../data/schema'
import { SESSIONS_NOTE, sanitizeUserAgent } from '../data/sessions'
import {
  UserSessionRevokeDialog,
  type RevokeTarget,
} from './user-session-revoke-dialog'
import { useUsers } from './users-provider'

const NOT_RECORDED = <span className='text-muted-foreground'>Not recorded</span>

const GONE_NOTICE = {
  one: 'This session is no longer active. It may have been revoked or expired. The list was refreshed.',
  all: 'This user no longer exists.',
}

// Sessions of one user — admin:* (USR-10). Mounted only while its tab is
// selected. IP and user agent are text only, shown in the two cells below and
// nowhere else: not in keys, URLs, toasts or live regions (R5, R6).
export function UserSessionsTab({ user }: { user: User }) {
  const selfId = useSelfUserId()
  // The API refuses self changes and audits each denial: do not call it.
  if (selfId !== undefined && selfId.toLowerCase() === user.id.toLowerCase())
    return (
      <div className='space-y-1 pt-2'>
        <h3 className='text-sm font-medium'>Active sessions</h3>
        <p className='text-sm text-muted-foreground'>
          You can&apos;t manage your own sessions here. Ask another
          administrator, or use Sign out to end your own session.
        </p>
      </div>
    )
  return <SessionsList user={user} />
}

function SessionsList({ user }: { user: User }) {
  const { api } = useUsers()
  const headingId = useId()
  const [offset, setOffset] = useState(0)
  const [dialog, setDialog] = useState<RevokeTarget | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const revokeAll = useRef<HTMLButtonElement>(null)
  // Refs by session id, never a selector built from API data.
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const focusAfter = useRef<
    { kind: 'row'; id: string } | { kind: 'all' } | { kind: 'heading' } | null
  >(null)
  useEffect(() => {
    if (dialog !== null || !focusAfter.current) return
    const target = focusAfter.current
    focusAfter.current = null
    const el =
      target.kind === 'row'
        ? buttons.current.get(target.id)
        : target.kind === 'all'
          ? revokeAll.current
          : null
    if (el?.isConnected) el.focus()
    else heading.current?.focus()
  }, [dialog])

  const q = useQuery(
    userSessionsQueryOptions(
      user.id,
      { limit: SESSIONS_PAGE_SIZE, offset },
      api
    )
  )
  const view = queryView(q)
  const settled = q.isSuccess && !q.isPlaceholderData

  // After the last row of the last page is revoked (or expires), step back to a
  // page that exists (React re-renders at once; no effect needed).
  if (settled && offset !== 0 && !q.data.items.length) {
    const target =
      q.data.total > 0
        ? Math.floor((q.data.total - 1) / SESSIONS_PAGE_SIZE) *
          SESSIONS_PAGE_SIZE
        : 0
    if (target !== offset) setOffset(target)
  }

  const total = q.data?.total ?? 0
  const from = total ? offset + 1 : 0
  const to = Math.min(offset + SESSIONS_PAGE_SIZE, total)
  const openDialog = (target: RevokeTarget) => {
    setNotice(null)
    setDialog(target)
  }
  const rowLabel = (s: UserSession) =>
    `Revoke session created ${formatDateTime(s.created_at)}`
  const time = (iso: string) => (
    <time dateTime={iso}>{formatDateTime(iso)}</time>
  )

  return (
    <div className='space-y-4 pt-2'>
      <div className='flex items-start justify-between gap-2'>
        <div className='space-y-1'>
          <h3
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className='text-sm font-medium'
          >
            Active sessions
          </h3>
          <p className='text-sm text-muted-foreground'>{SESSIONS_NOTE}</p>
        </div>
        <Can action='users.revokeAllSessions'>
          <Button
            ref={revokeAll}
            size='sm'
            variant='outline'
            className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
            aria-disabled={!(settled && total > 0)}
            onClick={() => {
              if (settled && total > 0) openDialog({ kind: 'all' })
            }}
          >
            Revoke all
          </Button>
        </Can>
      </div>

      <p role='status' aria-live='polite' className='sr-only'>
        {q.isSuccess
          ? `${total} active ${total === 1 ? 'session' : 'sessions'}.`
          : ''}
      </p>
      <p role='status' className='text-sm'>
        {notice}
      </p>

      {view.status === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={view.copy} />
      ) : view.status === 'pending' ? (
        <p role='status'>Loading sessions…</p>
      ) : view.status === 'error' ? (
        <div role='alert' className='space-y-2 text-sm'>
          <p>
            {isApiError(view.error, 404)
              ? 'This user no longer exists.'
              : "Couldn't load sessions."}
          </p>
          {!isApiError(view.error, 404) && (
            <Button size='sm' onClick={() => void q.refetch()}>
              Retry
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className='rounded-md border'>
            <Table aria-labelledby={headingId}>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>Created</TableHead>
                  <TableHead scope='col'>Last sign-in</TableHead>
                  <TableHead scope='col'>Browser last seen</TableHead>
                  <TableHead scope='col'>First sign-in IP</TableHead>
                  <TableHead scope='col'>First sign-in browser</TableHead>
                  <TableHead scope='col' className='text-end'>
                    <span className='sr-only'>Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.data.items.length ? (
                  view.data.items.map((s) => {
                    const ua = s.user_agent
                      ? sanitizeUserAgent(s.user_agent)
                      : ''
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{time(s.created_at)}</TableCell>
                        <TableCell>{time(s.last_used_at)}</TableCell>
                        <TableCell>{time(s.device_last_seen_at)}</TableCell>
                        <TableCell>
                          {s.ip ? (
                            <bdi className='font-mono text-xs'>{s.ip}</bdi>
                          ) : (
                            NOT_RECORDED
                          )}
                        </TableCell>
                        <TableCell className='max-w-56 whitespace-normal'>
                          {ua ? (
                            <bdi className='font-mono text-xs break-all text-muted-foreground'>
                              {ua}
                            </bdi>
                          ) : (
                            NOT_RECORDED
                          )}
                        </TableCell>
                        <TableCell className='text-end'>
                          <Can action='users.revokeSession'>
                            <Button
                              size='sm'
                              variant='outline'
                              className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
                              aria-label={rowLabel(s)}
                              aria-disabled={q.isPlaceholderData}
                              ref={(el) => {
                                if (el) buttons.current.set(s.id, el)
                                else buttons.current.delete(s.id)
                              }}
                              onClick={() => {
                                if (q.isPlaceholderData) return
                                openDialog({ kind: 'one', session: s })
                              }}
                            >
                              Revoke
                            </Button>
                          </Can>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className='h-16 text-center'>
                      No active sessions.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {total > SESSIONS_PAGE_SIZE && (
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
                    setOffset((o) => Math.max(0, o - SESSIONS_PAGE_SIZE))
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
                    setOffset((o) => o + SESSIONS_PAGE_SIZE)
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {dialog && (
        <UserSessionRevokeDialog
          user={user}
          target={dialog}
          onDone={(result) => {
            focusAfter.current =
              result === 'cancel'
                ? dialog.kind === 'one'
                  ? { kind: 'row', id: dialog.session.id }
                  : { kind: 'all' }
                : { kind: 'heading' }
            if (result === 'gone') setNotice(GONE_NOTICE[dialog.kind])
            if (result === 'success' && dialog.kind === 'all') setOffset(0)
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}
