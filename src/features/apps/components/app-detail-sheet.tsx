import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { isApiError } from '@/api'
import { queryView } from '@/lib/query-view'
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
import { Can } from '@/components/permissions/can'
import { appQueryOptions } from '../api/queries'
import { ADMIN_APP_KEY, type App } from '../data/app-schema'
import {
  ADMIN_APP_NOTE,
  formatDate,
  joinPolicyLabels,
  orgModeLabels,
} from '../data/data'
import { AppCredentialsTab } from './app-credentials-tab'
import { AppJoinRequestsTab } from './app-join-requests-tab'
import { AppPermissionsTab } from './app-permissions-tab'
import { AppStatusBadge } from './app-status-badge'
import { useApps } from './apps-provider'

type AppDetailSheetProps = {
  currentRow: App
  open: boolean
  onOpenChange: (open: boolean) => void
}

// GET /api/v1/apps/{key} — admin:apps:read. The list row shows while loading.
export function AppDetailSheet({
  currentRow,
  open,
  onOpenChange,
}: AppDetailSheetProps) {
  const { api } = useApps()
  const [tab, setTab] = useState('overview')
  const q = useQuery({
    ...appQueryOptions(currentRow.key, api),
    placeholderData: currentRow,
    enabled: open,
  })
  const view = queryView(q)
  const app = q.data ?? currentRow

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full gap-0 sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>
            {app.name} <span className='font-mono text-sm'>({app.key})</span>
          </SheetTitle>
          <SheetDescription>
            App settings, permissions, join requests and credentials.
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
                ? 'This app no longer exists.'
                : "Couldn't load this app."}
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
              <TabsTrigger value='permissions'>Permissions</TabsTrigger>
              {app.key !== ADMIN_APP_KEY && (
                <Can action='apps.viewJoinRequests'>
                  <TabsTrigger value='join-requests'>Join requests</TabsTrigger>
                </Can>
              )}
              <TabsTrigger value='credentials'>Credentials</TabsTrigger>
            </TabsList>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <TabsContent value='overview'>
                <AppOverview app={app} />
              </TabsContent>
              <TabsContent value='permissions'>
                <AppPermissionsTab app={app} />
              </TabsContent>
              {app.key !== ADMIN_APP_KEY && (
                <Can action='apps.viewJoinRequests'>
                  <TabsContent value='join-requests'>
                    <AppJoinRequestsTab app={app} />
                  </TabsContent>
                </Can>
              )}
              <TabsContent value='credentials'>
                <AppCredentialsTab app={app} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

const roleId = (id: string | null | undefined) =>
  id ? <code>{id}</code> : 'None'

function AppOverview({ app }: { app: App }) {
  const rows: [string, React.ReactNode][] = [
    ['Key', <span className='font-mono'>{app.key}</span>],
    ['Name', app.name],
    ['Status', <AppStatusBadge status={app.status} />],
    ['Join policy', joinPolicyLabels[app.join_policy]],
    ['Org mode', orgModeLabels[app.org_mode]],
    ['Default role', roleId(app.default_role_id)],
    ...(app.org_mode === 'required'
      ? [
          ['Org owner role', roleId(app.org_owner_role_id)] as [
            string,
            React.ReactNode,
          ],
        ]
      : []),
    [
      'Created',
      <time dateTime={app.created_at}>{formatDate(app.created_at)}</time>,
    ],
    [
      'Updated',
      <time dateTime={app.updated_at}>{formatDate(app.updated_at)}</time>,
    ],
  ]

  return (
    <div className='space-y-6 pt-2'>
      <dl className='grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm'>
        {rows.map(([label, value]) => (
          <div key={label} className='contents'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className='text-sm'>
        <Link
          to='/roles'
          search={{ app: app.key }}
          className='underline underline-offset-4'
        >
          Manage roles
        </Link>
      </p>
      <section aria-labelledby='app-origins-heading' className='space-y-2'>
        <h3 id='app-origins-heading' className='text-sm font-medium'>
          Origins{' '}
          <Badge variant='secondary' className='ms-1'>
            {app.origins.length}
          </Badge>
        </h3>
        {app.origins.length ? (
          <ul className='space-y-1 font-mono text-sm'>
            {app.origins.map((origin) => (
              <li key={origin}>{origin}</li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            No origins registered.
          </p>
        )}
      </section>
      {app.key === ADMIN_APP_KEY && (
        <p className='text-sm text-muted-foreground'>{ADMIN_APP_NOTE}</p>
      )}
    </div>
  )
}
