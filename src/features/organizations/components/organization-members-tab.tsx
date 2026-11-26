import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isApiError } from '@/api'
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
import { formatDate } from '@/features/apps/data/data'
import { UserStatusBadge } from '@/features/users/components/user-status-badge'
import { formatDateTimeZone } from '@/features/users/data/data'
import { MEMBERS_PAGE_SIZE, orgMembersQueryOptions } from '../api/members'
import { type Organization } from '../data/schema'
import { OffsetPager } from './offset-pager'
import { useOrganizations } from './organizations-provider'

// GET /api/v1/organizations/{org_id}/members — admin:users:read. Mounted only
// while its tab is selected. Rows are role assignments, as the API returns
// them; `created_at` is the grant date, there is no org-join date. Names and
// emails are text only (R5, R6).
export function OrganizationMembersTab({ org }: { org: Organization }) {
  const { api } = useOrganizations()
  const [offset, setOffset] = useState(0)
  const q = useQuery(
    orgMembersQueryOptions(org.id, { limit: MEMBERS_PAGE_SIZE, offset }, api)
  )
  const view = queryView(q)

  const settled = q.isSuccess && !q.isPlaceholderData
  // After the page empties, step back to a page that exists.
  if (settled && offset !== 0 && !q.data.items.length) {
    const target =
      q.data.total > 0
        ? Math.floor((q.data.total - 1) / MEMBERS_PAGE_SIZE) * MEMBERS_PAGE_SIZE
        : 0
    if (target !== offset) setOffset(target)
  }
  const total = q.data?.total ?? 0

  return (
    <div className='space-y-4 pt-2'>
      <div className='space-y-1'>
        <h3 className='text-sm font-medium'>Members</h3>
        <p className='text-sm text-muted-foreground'>
          Role assignments held in this organization. A person with two roles is
          listed twice, so the count is of role assignments, not people.
        </p>
      </div>
      <p role='status' aria-live='polite' className='sr-only'>
        {q.isSuccess
          ? `${total} ${total === 1 ? 'role assignment' : 'role assignments'}`
          : ''}
      </p>

      {view.status === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={view.copy} />
      ) : view.status === 'pending' ? (
        <p role='status'>Loading role assignments…</p>
      ) : view.status === 'error' ? (
        <div role='alert' className='space-y-2 text-sm'>
          {isApiError(view.error, 404) ? (
            <p>This organization no longer exists.</p>
          ) : (
            <>
              <p>Couldn&apos;t load role assignments.</p>
              <Button size='sm' onClick={() => void q.refetch()}>
                Retry
              </Button>
            </>
          )}
        </div>
      ) : view.data.items.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          No one holds a role in this organization.
        </p>
      ) : (
        <>
          <div className='overflow-x-auto rounded-md border'>
            <Table aria-label={`Role assignments in ${org.name}`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>User</TableHead>
                  <TableHead scope='col'>App</TableHead>
                  <TableHead scope='col'>Role</TableHead>
                  <TableHead scope='col'>Granted</TableHead>
                  <TableHead scope='col'>Expires</TableHead>
                  <TableHead scope='col'>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.data.items.map((m) => (
                  <TableRow key={m.assignment_id}>
                    <TableCell className='whitespace-normal'>
                      <div className='flex flex-wrap items-center gap-x-2'>
                        <bdi className='font-medium'>
                          {m.display_name ?? 'No display name'}
                        </bdi>
                        <UserStatusBadge status={m.user_status} />
                      </div>
                      <bdi className='block text-xs text-muted-foreground'>
                        {m.email}
                      </bdi>
                    </TableCell>
                    <TableCell className='font-mono text-sm'>{m.app}</TableCell>
                    <TableCell className='whitespace-normal'>
                      <div>{m.role_name}</div>
                      <div className='font-mono text-xs text-muted-foreground'>
                        {m.role_key}
                      </div>
                    </TableCell>
                    <TableCell>
                      <time dateTime={m.created_at}>
                        {formatDate(m.created_at)}
                      </time>
                    </TableCell>
                    <TableCell>
                      {m.expires_at
                        ? formatDateTimeZone(m.expires_at)
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.active ? 'secondary' : 'outline'}>
                        {m.active ? 'Not expired' : 'Expired'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <OffsetPager
            offset={offset}
            pageSize={MEMBERS_PAGE_SIZE}
            total={total}
            noun='role assignments'
            onOffsetChange={setOffset}
          />
        </>
      )}
    </div>
  )
}
