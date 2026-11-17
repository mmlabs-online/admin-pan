import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { isApiError } from '@/api'
import { queryView } from '@/lib/query-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { Can } from '@/components/permissions/can'
import {
  userQueryOptions,
  userRoleAssignmentsQueryOptions,
} from '../api/queries'
import { formatDateTime, userLabel } from '../data/data'
import { type User } from '../data/schema'
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
      <SheetContent className='overflow-y-auto'>
        <SheetHeader className='text-start'>
          <SheetTitle>{userLabel(user)}</SheetTitle>
          <SheetDescription>mmlabs account details</SheetDescription>
        </SheetHeader>
        <div className='space-y-6 px-4 pb-4'>
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
            <RoleAssignments userId={currentRow.id} open={open} />
          </Can>

          <Can action='audit.view'>
            <section aria-labelledby='user-audit-heading' className='space-y-2'>
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

/** `GET /api/v1/users/{id}/role-assignments` (read-only; assign/revoke are separate tickets). */
function RoleAssignments({ userId, open }: { userId: string; open: boolean }) {
  const { api } = useUsers()
  const q = useQuery({
    ...userRoleAssignmentsQueryOptions(userId, api),
    enabled: open,
  })
  const view = queryView(q)

  return (
    <section aria-labelledby='user-apps-roles-heading' className='space-y-2'>
      <h3 id='user-apps-roles-heading' className='font-medium'>
        Apps &amp; roles
      </h3>
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
          <div className='overflow-x-auto rounded-md border'>
            <table
              aria-labelledby='user-apps-roles-heading'
              className='w-full text-start text-sm'
            >
              <thead className='text-muted-foreground'>
                <tr>
                  <th scope='col' className='px-3 py-2 text-start font-medium'>
                    App
                  </th>
                  <th scope='col' className='px-3 py-2 text-start font-medium'>
                    Role
                  </th>
                  <th scope='col' className='px-3 py-2 text-start font-medium'>
                    Scope
                  </th>
                  <th scope='col' className='px-3 py-2 text-start font-medium'>
                    Expires
                  </th>
                  <th scope='col' className='px-3 py-2 text-start font-medium'>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {view.data.items.map((a) => (
                  <tr key={a.id}>
                    <td className='px-3 py-2'>{a.app}</td>
                    <td className='px-3 py-2'>{a.role_key}</td>
                    <td className='px-3 py-2 break-all'>
                      {a.org_id === null ? (
                        'App-wide'
                      ) : (
                        <code className='text-xs'>{a.org_id}</code>
                      )}
                    </td>
                    <td className='px-3 py-2'>
                      {a.expires_at ? formatDateTime(a.expires_at) : 'Never'}
                    </td>
                    <td className='px-3 py-2'>
                      <Badge variant={a.active ? 'secondary' : 'outline'}>
                        {a.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.data.total > view.data.items.length && (
            <p className='text-sm text-muted-foreground'>
              Showing {view.data.items.length} of {view.data.total}
            </p>
          )}
        </>
      )}
    </section>
  )
}
