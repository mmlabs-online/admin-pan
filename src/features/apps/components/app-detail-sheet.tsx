import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAccessData } from '../data/access-store'
import { formatDate, joinPolicyLabels, orgModeLabels } from '../data/data'
import { type App } from '../data/schema'
import { AppPermissionsTab } from './app-permissions-tab'
import { AppRolesTab } from './app-roles-tab'
import { AppStatusBadge } from './app-status-badge'

type AppDetailSheetProps = {
  app: App
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AppDetailSheet({
  app,
  open,
  onOpenChange,
}: AppDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full gap-0 sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>
            {app.name} <span className='font-mono text-sm'>({app.key})</span>
          </SheetTitle>
          <SheetDescription>
            App settings, permissions and roles.
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue='overview' className='min-h-0 flex-1 px-4 pb-4'>
          <TabsList>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='permissions'>Permissions</TabsTrigger>
            <TabsTrigger value='roles'>Roles</TabsTrigger>
          </TabsList>
          <div className='min-h-0 flex-1 overflow-y-auto'>
            <TabsContent value='overview'>
              <AppOverview app={app} />
            </TabsContent>
            <TabsContent value='permissions'>
              <AppPermissionsTab app={app} />
            </TabsContent>
            <TabsContent value='roles'>
              <AppRolesTab app={app} />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function AppOverview({ app }: { app: App }) {
  const { roles, app_member_counts } = useAccessData()
  const defaultRole = roles.find((r) => r.id === app.default_role_id)

  const rows: [string, React.ReactNode][] = [
    ['Key', <span className='font-mono'>{app.key}</span>],
    ['Name', app.name],
    ['Status', <AppStatusBadge status={app.status} />],
    ['Join policy', joinPolicyLabels[app.join_policy]],
    ['Org mode', orgModeLabels[app.org_mode]],
    [
      'Default role',
      defaultRole ? (
        <span className='font-mono'>{defaultRole.key}</span>
      ) : (
        'None'
      ),
    ],
    ['Members', (app_member_counts[app.id] ?? 0).toLocaleString('en-US')],
    ['Created', formatDate(app.created_at)],
    ['Updated', formatDate(app.updated_at)],
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
    </div>
  )
}
