import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { queryView } from '@/lib/query-view'
import { Badge } from '@/components/ui/badge'
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
import { formatDate } from '@/features/apps/data/data'
import {
  ENTITLEMENTS_PAGE_SIZE,
  orgEntitlementsQueryOptions,
} from '../api/entitlements'
import { formatLimitValue, type Entitlement } from '../data/entitlement-schema'
import { type Organization } from '../data/schema'
import { EntitlementEnabledDialog } from './entitlement-enabled-dialog'
import { EntitlementFormDialog } from './entitlement-form-dialog'
import { useOrganizations } from './organizations-provider'

// GET /api/v1/organizations/{org_id}/entitlements — admin:entitlements:read.
// Mounted only while its tab is selected, so nothing is fetched before then.
// `active` is the API's answer (enabled + org active + app active), never
// recomputed here (R1).
export function OrganizationEntitlementsTab({ org }: { org: Organization }) {
  const { api } = useOrganizations()
  const [granting, setGranting] = useState(false)
  const [editing, setEditing] = useState<Entitlement | null>(null)
  const [toggle, setToggle] = useState<Entitlement | null>(null)
  const grantButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // Refs by row id, never a selector built from API data. After a cancel focus
  // returns to that row's control; if the row is gone, to the stable heading.
  const switches = useRef(new Map<string, HTMLButtonElement>())
  const editButtons = useRef(new Map<string, HTMLButtonElement>())
  const focusAfter = useRef<string | null>(null)

  const q = useQuery(
    orgEntitlementsQueryOptions(
      org.id,
      { limit: ENTITLEMENTS_PAGE_SIZE, offset: 0 },
      api
    )
  )
  const view = queryView(q)

  // The confirm dialog has no Radix trigger, so focus goes back by hand.
  useEffect(() => {
    if (toggle !== null || !focusAfter.current) return
    const id = focusAfter.current
    focusAfter.current = null
    ;(switches.current.get(id) ?? heading.current)?.focus()
  }, [toggle])

  const items = view.status === 'success' ? view.data.items : []

  return (
    <div className='space-y-4 pt-2'>
      <div className='flex items-start justify-between gap-2'>
        <div className='space-y-1'>
          <h3 ref={heading} tabIndex={-1} className='text-sm font-medium'>
            Entitlements
          </h3>
          <p className='text-sm text-muted-foreground'>
            Products this organization can use. Plan and limits are read by each
            app; there is no billing here. Changes are recorded in the audit
            log.
          </p>
        </div>
        <div className='flex flex-col items-end gap-1'>
          <Can action='entitlements.grant' disable>
            {({ disabled, describedBy }) => (
              <Button
                ref={grantButton}
                size='sm'
                disabled={disabled}
                aria-describedby={describedBy}
                onClick={() => setGranting(true)}
              >
                <Plus className='size-4' aria-hidden='true' />
                Grant product
              </Button>
            )}
          </Can>
        </div>
      </div>
      {org.status === 'suspended' && (
        <p className='text-sm text-muted-foreground'>
          This organization is suspended, so its entitlements are inactive. You
          can still grant and edit them.
        </p>
      )}

      {view.status === 'forbidden' ? (
        <ForbiddenPanel variant='inline' copy={view.copy} />
      ) : view.status === 'pending' ? (
        <p role='status'>Loading entitlements…</p>
      ) : view.status === 'error' ? (
        <div role='alert' className='space-y-2 text-sm'>
          <p>Couldn&apos;t load entitlements.</p>
          <Button size='sm' onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className='overflow-x-auto rounded-md border'>
            <Table aria-label={`Entitlements of ${org.name}`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope='col'>App</TableHead>
                  <TableHead scope='col'>Plan</TableHead>
                  <TableHead scope='col'>Limits</TableHead>
                  <TableHead scope='col'>Enabled</TableHead>
                  <TableHead scope='col'>Status</TableHead>
                  <TableHead scope='col'>Updated</TableHead>
                  <TableHead scope='col' className='text-end'>
                    <span className='sr-only'>Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length ? (
                  items.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className='font-mono text-sm'>
                        {e.app_key}
                      </TableCell>
                      <TableCell>{e.plan}</TableCell>
                      <TableCell>
                        {Object.keys(e.limits).length ? (
                          <ul className='text-sm'>
                            {Object.entries(e.limits).map(([key, value]) => (
                              <li key={key}>
                                {key}: {formatLimitValue(value)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          'None'
                        )}
                      </TableCell>
                      <TableCell>
                        <Can action='entitlements.update' disable>
                          {({ disabled, describedBy }) => (
                            <Switch
                              checked={e.enabled}
                              disabled={disabled}
                              aria-describedby={describedBy}
                              aria-label={`${e.app_key} enabled`}
                              ref={(el) => {
                                if (el) switches.current.set(e.id, el)
                                else switches.current.delete(e.id)
                              }}
                              onCheckedChange={() => setToggle(e)}
                            />
                          )}
                        </Can>
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.active ? 'outline' : 'secondary'}>
                          {!e.enabled
                            ? 'Disabled'
                            : e.active
                              ? 'Active'
                              : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <time dateTime={e.updated_at}>
                          {formatDate(e.updated_at)}
                        </time>
                      </TableCell>
                      <TableCell className='text-end'>
                        <Can action='entitlements.update'>
                          <Button
                            size='sm'
                            variant='outline'
                            aria-label={`Edit ${e.app_key}`}
                            ref={(el) => {
                              if (el) editButtons.current.set(e.id, el)
                              else editButtons.current.delete(e.id)
                            }}
                            onClick={() => setEditing(e)}
                          >
                            Edit
                          </Button>
                        </Can>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className='h-16 text-center'>
                      No products granted yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {items.some((e) => e.enabled && !e.active) && (
            <p className='text-sm text-muted-foreground'>
              Inactive: enabled, but the organization is suspended or the app is
              disabled.
            </p>
          )}
          {view.status === 'success' && view.data.total > items.length && (
            <p role='status' aria-live='polite' className='text-sm'>
              Showing {items.length} of {view.data.total} entitlements.
            </p>
          )}
        </>
      )}

      {granting && (
        <EntitlementFormDialog
          mode='grant'
          org={org}
          existing={items.map((e) => e.app_key)}
          onOpenChange={setGranting}
          returnFocus={() => grantButton.current?.focus()}
        />
      )}
      {editing && (
        <EntitlementFormDialog
          mode='edit'
          org={org}
          entitlement={editing}
          onOpenChange={() => setEditing(null)}
          returnFocus={() =>
            (editButtons.current.get(editing.id) ?? heading.current)?.focus()
          }
        />
      )}
      {toggle && (
        <EntitlementEnabledDialog
          org={org}
          entitlement={toggle}
          onDone={() => {
            focusAfter.current = toggle.id
            setToggle(null)
          }}
        />
      )}
    </div>
  )
}
