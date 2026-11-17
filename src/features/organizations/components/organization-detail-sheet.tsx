import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isApiError } from '@/api'
import { queryView } from '@/lib/query-view'
import { cn } from '@/lib/utils'
import { useActionPermission } from '@/context/permission-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { formatDate } from '@/features/apps/data/data'
import { organizationQueryOptions } from '../api/queries'
import { organizationStatuses, statusBadgeClasses } from '../data/data'
import { type Organization } from '../data/schema'
import { OrganizationEntitlementsTab } from './organization-entitlements-tab'
import { useOrganizations } from './organizations-provider'

type OrganizationDetailSheetProps = {
  currentRow: Organization
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Radix returns focus only to a `Trigger`; the opener returns it by hand. */
  returnFocus: () => void
}

// GET /api/v1/organizations/{org_id} — admin:organizations:read. The list row
// shows while loading. A minimal shell: the rest of the detail is PAN-014b.
export function OrganizationDetailSheet({
  currentRow,
  open,
  onOpenChange,
  returnFocus,
}: OrganizationDetailSheetProps) {
  const { api } = useOrganizations()
  const [tab, setTab] = useState('overview')
  const showEntitlements = useActionPermission('entitlements.view') !== 'denied'
  const q = useQuery({
    ...organizationQueryOptions(currentRow.id, api),
    placeholderData: currentRow,
    enabled: open,
  })
  const view = queryView(q)
  const org = q.data ?? currentRow

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className='w-full gap-0 sm:max-w-2xl'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        <SheetHeader>
          <SheetTitle>
            {org.name} <span className='font-mono text-sm'>({org.slug})</span>
          </SheetTitle>
          <SheetDescription>
            Organization details and product entitlements.
          </SheetDescription>
        </SheetHeader>
        {view.status === 'forbidden' ? (
          <div className='px-4'>
            <ForbiddenPanel variant='inline' copy={view.copy} />
          </div>
        ) : view.status === 'error' ? (
          <div role='alert' className='space-y-2 px-4 text-sm'>
            <p>
              {isApiError(view.error, 404)
                ? 'This organization no longer exists.'
                : "Couldn't load this organization."}
            </p>
            {!isApiError(view.error, 404) && (
              <Button size='sm' onClick={() => void q.refetch()}>
                Retry
              </Button>
            )}
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={setTab}
            className='min-h-0 flex-1 px-4 pb-4'
          >
            <TabsList>
              <TabsTrigger value='overview'>Overview</TabsTrigger>
              {showEntitlements && (
                <TabsTrigger value='entitlements'>Entitlements</TabsTrigger>
              )}
            </TabsList>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <TabsContent value='overview'>
                <OrganizationOverview org={org} />
              </TabsContent>
              {showEntitlements && (
                <TabsContent value='entitlements'>
                  <OrganizationEntitlementsTab org={org} />
                </TabsContent>
              )}
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

function OrganizationOverview({ org }: { org: Organization }) {
  const status = organizationStatuses.find((s) => s.value === org.status)
  const rows: [string, React.ReactNode][] = [
    ['Slug', <span className='font-mono'>{org.slug}</span>],
    ['Name', org.name],
    [
      'Status',
      <Badge
        variant='outline'
        className={cn('capitalize', statusBadgeClasses.get(org.status))}
      >
        {status?.label ?? org.status}
      </Badge>,
    ],
    ['Description', org.description || 'No description'],
    [
      'Created',
      <time dateTime={org.created_at}>{formatDate(org.created_at)}</time>,
    ],
  ]
  return (
    <dl className='grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 pt-2 text-sm'>
      {rows.map(([label, value]) => (
        <div key={label} className='contents'>
          <dt className='text-muted-foreground'>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
