import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { isApiError } from '@/api'
import { queryView } from '@/lib/query-view'
import { useActionPermission } from '@/context/permission-provider'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { Can } from '@/components/permissions/can'
import { userQueryOptions } from '../api/queries'
import { formatDateTime, userLabel } from '../data/data'
import { type User } from '../data/schema'
import { UserRoleAssignments } from './user-role-assignments'
import { UserSessionsTab } from './user-sessions-tab'
import { UserStatusBadge } from './user-status-badge'
import { useUsers } from './users-provider'

type UsersDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className='grid grid-cols-3 gap-2 py-1.5'>
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='col-span-2 text-sm break-all'>{children}</dd>
    </div>
  )
}

/** User details — `GET /api/v1/users/{id}` (admin:users:read). */
export function UsersDetailSheet({
  open,
  onOpenChange,
  currentRow,
}: UsersDetailSheetProps) {
  const { api } = useUsers()
  const [tab, setTab] = useState('details')
  // Reopening must not land on the sessions list (IP and user agent).
  if (!open && tab !== 'details') setTab('details')
  const showSessions = useActionPermission('users.viewSessions') !== 'denied'
  // The list row is only a placeholder; the fetched user is the truth.
  const q = useQuery({
    ...userQueryOptions(currentRow.id, api),
    placeholderData: currentRow,
    enabled: open,
  })
  const view = queryView(q)
  const user = q.data ?? currentRow

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full gap-0 sm:max-w-2xl'>
        <SheetHeader className='text-start'>
          <SheetTitle>{userLabel(user)}</SheetTitle>
          <SheetDescription>mmlabs account details</SheetDescription>
        </SheetHeader>
        <Tabs
          value={showSessions ? tab : 'details'}
          onValueChange={setTab}
          className='min-h-0 flex-1 px-4 pb-4'
        >
          <TabsList>
            <TabsTrigger value='details'>Details</TabsTrigger>
            {showSessions && (
              <TabsTrigger value='sessions'>Sessions</TabsTrigger>
            )}
          </TabsList>
          <div className='min-h-0 flex-1 overflow-y-auto'>
            <TabsContent value='details'>
              <div className='space-y-6 pt-2'>
                {view.status === 'forbidden' ? (
                  <ForbiddenPanel variant='inline' copy={view.copy} />
                ) : view.status === 'error' ? (
                  <div role='alert' className='space-y-2 text-sm'>
                    <p>
                      {isApiError(view.error, 404)
                        ? 'This user no longer exists.'
                        : "Couldn't load this user."}
                    </p>
                    {!isApiError(view.error, 404) && (
                      <Button size='sm' onClick={() => void q.refetch()}>
                        Retry
                      </Button>
                    )}
                  </div>
                ) : (
                  <UserFields user={user} />
                )}

                <Separator />

                <Can action='roles.viewAssignments'>
                  <UserRoleAssignments user={user} open={open} />
                </Can>

                <Can action='audit.view'>
                  <section
                    aria-labelledby='user-audit-heading'
                    className='space-y-2'
                  >
                    <h3 id='user-audit-heading' className='font-medium'>
                      Audit history
                    </h3>
                    <ul className='space-y-1 text-sm'>
                      <li>
                        <Link
                          to='/audit-log'
                          search={{ targetType: 'user', target: currentRow.id }}
                          className='underline underline-offset-4'
                        >
                          Events about this user
                        </Link>
                      </li>
                      <li>
                        <Link
                          to='/audit-log'
                          search={{ actor: currentRow.id }}
                          className='underline underline-offset-4'
                        >
                          Actions by this user
                        </Link>
                      </li>
                    </ul>
                  </section>
                </Can>
              </div>
            </TabsContent>
            {showSessions && (
              <TabsContent value='sessions'>
                <UserSessionsTab user={user} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function UserFields({ user }: { user: User }) {
  return (
    <dl>
      <Field label='ID'>
        <code className='text-xs'>{user.id}</code>
      </Field>
      <Field label='Email'>{user.email}</Field>
      <Field label='Display name'>
        {user.display_name ?? (
          <span className='text-muted-foreground'>Not set</span>
        )}
      </Field>
      <Field label='Status'>
        <UserStatusBadge status={user.status} />
      </Field>
      <Field label='Email verified'>
        {user.email_verified_at ? (
          formatDateTime(user.email_verified_at)
        ) : (
          <span className='text-muted-foreground'>Not verified</span>
        )}
      </Field>
      <Field label='Created at'>{formatDateTime(user.created_at)}</Field>
      <Field label='Updated at'>{formatDateTime(user.updated_at)}</Field>
    </dl>
  )
}
