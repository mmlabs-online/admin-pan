import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isApiError } from '@/api'
import { queryView } from '@/lib/query-view'
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
import { formatDate } from '@/features/apps/data/data'
import {
  INVITATIONS_PAGE_SIZE,
  orgInvitationsQueryOptions,
} from '../api/members'
import {
  ALL_STATUSES,
  invitationStatusLabel,
  invitationStatusOptions,
  type InvitationStatus,
} from '../data/members'
import { type Organization } from '../data/schema'
import { OffsetPager } from './offset-pager'
import { useOrganizations } from './organizations-provider'

// GET /api/v1/organizations/{org_id}/invitations — admin:organizations:read.
// Mounted only while its tab is selected. The API returns no invitee email.
export function OrganizationInvitationsTab({ org }: { org: Organization }) {
  const { api } = useOrganizations()
  const statusId = useId()
  const [status, setStatus] = useState<InvitationStatus | typeof ALL_STATUSES>(
    'pending'
  )
  const [offset, setOffset] = useState(0)
  const q = useQuery(
    orgInvitationsQueryOptions(
      org.id,
      {
        limit: INVITATIONS_PAGE_SIZE,
        offset,
        ...(status === ALL_STATUSES ? {} : { status }),
      },
      api
    )
  )
  const view = queryView(q)

  const settled = q.isSuccess && !q.isPlaceholderData
  // After the page empties, step back to a page that exists.
  if (settled && offset !== 0 && !q.data.items.length) {
    const target =
      q.data.total > 0
        ? Math.floor((q.data.total - 1) / INVITATIONS_PAGE_SIZE) *
          INVITATIONS_PAGE_SIZE
        : 0
    if (target !== offset) setOffset(target)
  }
  const total = q.data?.total ?? 0
  const emptyText =
    status === 'pending'
      ? 'No pending invitations.'
      : status === ALL_STATUSES
        ? 'No invitations.'
        : `No ${invitationStatusLabel(status).toLowerCase()} invitations.`

  return (
    <div className='space-y-4 pt-2'>
      <div className='space-y-1'>
        <h3 className='text-sm font-medium'>Invitations</h3>
        <p className='text-sm text-muted-foreground'>
          Invitations to join this organization, newest first. The API does not
          return the invitee&apos;s email.
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as InvitationStatus | typeof ALL_STATUSES)
            setOffset(0)
          }}
        >
          <SelectTrigger id={statusId} size='sm' className='w-40'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {invitationStatusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p role='status' aria-live='polite' className='sr-only'>
        {q.isSuccess
          ? `${total} ${total === 1 ? 'invitation' : 'invitations'} found.`
          : ''}
      </p>

      {view.status === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={view.copy} />
      ) : view.status === 'pending' ? (
        <p role='status'>Loading invitations…</p>
      ) : view.status === 'error' ? (
        <div role='alert' className='space-y-2 text-sm'>
          {isApiError(view.error, 404) ? (
            <p>This organization no longer exists.</p>
          ) : (
            <>
              <p>Couldn&apos;t load invitations.</p>
              <Button size='sm' onClick={() => void q.refetch()}>
                Retry
              </Button>
            </>
          )}
        </div>
      ) : view.data.items.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{emptyText}</p>
      ) : (
        <>
          <div className='overflow-x-auto rounded-md border'>
            <Table aria-label={`Invitations of ${org.name}`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>Status</TableHead>
                  <TableHead scope='col'>App</TableHead>
                  <TableHead scope='col'>Role</TableHead>
                  <TableHead scope='col'>Created</TableHead>
                  <TableHead scope='col'>Expires</TableHead>
                  <TableHead scope='col'>Accepted / revoked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.data.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Badge variant='outline'>
                        {invitationStatusLabel(i.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className='font-mono text-sm'>{i.app}</TableCell>
                    <TableCell className='font-mono text-sm'>
                      {i.role_key}
                    </TableCell>
                    <TableCell>
                      <time dateTime={i.created_at}>
                        {formatDate(i.created_at)}
                      </time>
                    </TableCell>
                    <TableCell>
                      <time dateTime={i.expires_at}>
                        {formatDate(i.expires_at)}
                      </time>
                    </TableCell>
                    <TableCell>
                      {i.accepted_at ? (
                        <>
                          Accepted{' '}
                          <time dateTime={i.accepted_at}>
                            {formatDate(i.accepted_at)}
                          </time>
                        </>
                      ) : i.revoked_at ? (
                        <>
                          Revoked{' '}
                          <time dateTime={i.revoked_at}>
                            {formatDate(i.revoked_at)}
                          </time>
                        </>
                      ) : (
                        'None'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <OffsetPager
            offset={offset}
            pageSize={INVITATIONS_PAGE_SIZE}
            total={total}
            noun='invitations'
            onOffsetChange={setOffset}
          />
        </>
      )}
    </div>
  )
}
