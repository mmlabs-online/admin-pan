import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { queryView } from '@/lib/query-view'
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
import {
  CREDENTIALS_PAGE_SIZE,
  appCredentialsQueryOptions,
} from '../api/queries'
import { ADMIN_APP_KEY, type App, type AppCredential } from '../data/app-schema'
import { CREDENTIAL_LIMIT_NOTE, formatDate } from '../data/data'
import { AppCredentialIssueDialog } from './app-credential-issue-dialog'
import { AppCredentialRevokeDialog } from './app-credential-revoke-dialog'
import { useApps } from './apps-provider'

// GET /api/v1/apps/{key}/credentials — admin:apps:read. Mounted only while its
// tab is selected, so nothing is fetched before then.
export function AppCredentialsTab({ app }: { app: App }) {
  const { api } = useApps()
  const [offset, setOffset] = useState(0)
  const [issuing, setIssuing] = useState(false)
  const [revoking, setRevoking] = useState<AppCredential | null>(null)
  const issueButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const disabledNoteId = useId()
  // Refs by row id, never a selector built from API data. After a cancel focus
  // returns to that row's button; after a success the row's button is gone, so
  // focus goes to the stable heading (R10).
  const revokeButtons = useRef(new Map<string, HTMLButtonElement>())
  const focusAfter = useRef<
    { kind: 'row'; id: string } | { kind: 'heading' } | null
  >(null)
  useEffect(() => {
    if (revoking !== null || !focusAfter.current) return
    const target = focusAfter.current
    focusAfter.current = null
    if (target.kind === 'row') revokeButtons.current.get(target.id)?.focus()
    else heading.current?.focus()
  }, [revoking])

  const q = useQuery(
    appCredentialsQueryOptions(
      app.key,
      { limit: CREDENTIALS_PAGE_SIZE, offset },
      api
    )
  )
  const view = queryView(q)
  const isAdminApp = app.key === ADMIN_APP_KEY
  const appDisabled = app.status === 'disabled'

  const total = q.data?.total ?? 0
  const from = total ? offset + 1 : 0
  const to = Math.min(offset + CREDENTIALS_PAGE_SIZE, total)

  return (
    <div className='space-y-4 pt-2'>
      <div className='flex items-start justify-between gap-2'>
        <div className='space-y-1'>
          <h3 ref={heading} tabIndex={-1} className='text-sm font-medium'>
            API credentials
          </h3>
          <p className='text-sm text-muted-foreground'>
            Deploy jobs and app backends use a credential to call org-admin-api
            for this app. {CREDENTIAL_LIMIT_NOTE}
          </p>
        </div>
        <div className='flex flex-col items-end gap-1'>
          <Can action='apps.issueCredential' disable>
            {({ disabled, describedBy }) => (
              <Button
                ref={issueButton}
                size='sm'
                disabled={disabled || appDisabled}
                aria-describedby={
                  [describedBy, appDisabled ? disabledNoteId : undefined]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                onClick={() => setIssuing(true)}
              >
                <Plus className='size-4' aria-hidden='true' />
                Issue credential
              </Button>
            )}
          </Can>
          {appDisabled && (
            <span id={disabledNoteId} className='text-sm text-muted-foreground'>
              Enable this app to issue credentials.
            </span>
          )}
        </div>
      </div>
      <p className='text-sm text-muted-foreground'>
        {isAdminApp && 'The admin app can only have releases credentials. '}
        Issuing needs admin:*.
      </p>

      {view.status === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={view.copy} />
      ) : view.status === 'pending' ? (
        <p role='status'>Loading credentials…</p>
      ) : view.status === 'error' ? (
        <div role='alert' className='space-y-2 text-sm'>
          <p>Couldn&apos;t load credentials.</p>
          <Button size='sm' onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className='overflow-x-auto rounded-md border'>
            <Table aria-label={`Credentials of ${app.key}`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>Key ID</TableHead>
                  <TableHead scope='col'>Scope</TableHead>
                  <TableHead scope='col'>Status</TableHead>
                  <TableHead scope='col'>Created</TableHead>
                  <TableHead scope='col'>Last used</TableHead>
                  <TableHead scope='col' className='text-end'>
                    <span className='sr-only'>Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.data.items.length ? (
                  view.data.items.map((credential) => (
                    <TableRow key={credential.id}>
                      <TableCell className='font-mono text-sm'>
                        {credential.key_id}
                      </TableCell>
                      <TableCell>
                        <code>{credential.scope}</code>
                      </TableCell>
                      <TableCell>
                        {credential.active ? (
                          <Badge variant='outline'>Active</Badge>
                        ) : (
                          <Badge variant='secondary'>
                            Revoked{' '}
                            {credential.revoked_at && (
                              <time dateTime={credential.revoked_at}>
                                {formatDate(credential.revoked_at)}
                              </time>
                            )}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <time dateTime={credential.created_at}>
                          {formatDate(credential.created_at)}
                        </time>
                      </TableCell>
                      <TableCell>
                        {credential.last_used_at ? (
                          <time dateTime={credential.last_used_at}>
                            {formatDate(credential.last_used_at)}
                          </time>
                        ) : (
                          'Never'
                        )}
                      </TableCell>
                      <TableCell className='text-end'>
                        {credential.active && (
                          <Can action='apps.revokeCredential'>
                            <Button
                              size='sm'
                              variant='outline'
                              aria-label={`Revoke ${credential.key_id}`}
                              ref={(el) => {
                                if (el)
                                  revokeButtons.current.set(credential.id, el)
                                else revokeButtons.current.delete(credential.id)
                              }}
                              onClick={() => setRevoking(credential)}
                            >
                              Revoke
                            </Button>
                          </Can>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className='h-16 text-center'>
                      No credentials yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {total > CREDENTIALS_PAGE_SIZE && (
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
                    setOffset((o) => Math.max(0, o - CREDENTIALS_PAGE_SIZE))
                  }
                >
                  Previous
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={to >= total}
                  onClick={() => setOffset((o) => o + CREDENTIALS_PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {issuing && (
        <AppCredentialIssueDialog
          app={app}
          onOpenChange={setIssuing}
          returnFocus={() => issueButton.current?.focus()}
        />
      )}
      {revoking && (
        <AppCredentialRevokeDialog
          app={app}
          credential={revoking}
          onDone={(result) => {
            focusAfter.current =
              result === 'success'
                ? { kind: 'heading' }
                : { kind: 'row', id: revoking.id }
            setRevoking(null)
          }}
        />
      )}
    </div>
  )
}
