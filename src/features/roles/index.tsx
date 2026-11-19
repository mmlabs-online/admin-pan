import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { getApi, isApiError, type ApiClient } from '@/api'
import { Plus } from 'lucide-react'
import { queryView } from '@/lib/query-view'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import { ConfigDrawer } from '@/components/config-drawer'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Can } from '@/components/permissions/can'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { appQueryOptions, appsListQueryOptions } from '../apps/api/queries'
import { ADMIN_APP_KEY } from '../apps/data/app-schema'
import { RolesAppPicker } from './components/roles-app-picker'
import { RolesDialogs } from './components/roles-dialogs'
import { RolesProvider, useRoles } from './components/roles-provider'
import { RolesTable } from './components/roles-table'

const route = getRouteApi('/_authenticated/roles/')

export function Roles() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <RolesContent search={search} navigate={navigate} />
      </Main>
    </>
  )
}

type RolesContentProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
  /** Injected in tests; production uses the shared client. */
  api?: ApiClient
}

/** Page body without the router-bound shell, so it can be tested directly. */
export function RolesContent({ search, navigate, api }: RolesContentProps) {
  const client = api ?? getApi()
  const appsQuery = useQuery(
    appsListQueryOptions({ limit: 100, offset: 0 }, client)
  )
  const appsView = queryView(appsQuery)
  const apps = appsQuery.data?.items ?? []
  const requested = typeof search.app === 'string' ? search.app : undefined
  // Default: the first app that is not `admin`. Not written to the URL.
  const selectedKey =
    requested ?? apps.find((a) => a.key !== ADMIN_APP_KEY)?.key ?? apps[0]?.key
  const inList = apps.find((a) => a.key === selectedKey)
  // An app beyond the first 100 is opened by URL only.
  const extra = useQuery({
    ...appQueryOptions(requested ?? '', client),
    enabled: Boolean(requested) && appsQuery.isSuccess && !inList,
  })
  const app = inList ?? extra.data ?? null

  // Mounted before its text changes, so the load announcement is reliable;
  // it stays across pending -> success.
  const loadingStatus = (
    <p role='status' className='sr-only'>
      {appsView.status === 'pending' ? 'Loading apps…' : ''}
    </p>
  )

  if (appsView.status === 'forbidden')
    return (
      <ForbiddenPanel
        variant='page'
        copy={appsView.copy}
        onRetry={() => void appsQuery.refetch()}
      />
    )
  if (appsView.status !== 'success')
    return (
      <>
        {loadingStatus}
        <RolesTitle />
        {appsView.status === 'pending' ? (
          <p>Loading apps…</p>
        ) : (
          <div role='alert' className='space-y-2'>
            <p>Couldn&apos;t load apps.</p>
            <Button size='sm' onClick={() => void appsQuery.refetch()}>
              Retry
            </Button>
          </div>
        )}
      </>
    )

  const pick = (key: string) =>
    navigate({ search: (prev) => ({ ...prev, app: key, page: undefined }) })
  const appGone = Boolean(requested) && !inList && isApiError(extra.error, 404)
  const appError = Boolean(requested) && !inList && extra.isError && !appGone

  return (
    <>
      {loadingStatus}
      <RolesProvider api={client} app={app}>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <RolesTitle />
          <NewRoleButton />
        </div>
        {apps.length || requested ? (
          <RolesAppPicker
            apps={apps}
            total={appsQuery.data?.total ?? 0}
            selected={app}
            onChange={pick}
          />
        ) : (
          <p>No apps registered yet.</p>
        )}
        {app?.key === ADMIN_APP_KEY && (
          <p className='text-sm text-muted-foreground'>
            Changes to the admin app&apos;s roles need the admin:* permission.
            Permission changes apply to everyone holding the role on their next
            request.
          </p>
        )}
        {app?.status === 'disabled' && (
          <p className='text-sm text-muted-foreground'>
            This app is disabled. Its roles can still be edited.
          </p>
        )}
        {app ? (
          <RolesTable app={app} search={search} navigate={navigate} />
        ) : appGone ? (
          <p role='alert'>This app no longer exists.</p>
        ) : appError ? (
          <div role='alert' className='space-y-2'>
            <p>Couldn&apos;t load this app.</p>
            <Button size='sm' onClick={() => void extra.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        <RolesDialogs />
      </RolesProvider>
    </>
  )
}

function RolesTitle() {
  return (
    <div>
      <h2 className='text-2xl font-bold tracking-tight'>Roles</h2>
      <p className='text-muted-foreground'>
        Roles of one app and the permissions they grant.
      </p>
    </div>
  )
}

function NewRoleButton() {
  const { app, setOpen } = useRoles()
  return (
    <Can action='roles.create' disable>
      {({ disabled, describedBy }) => (
        <Button
          data-new-role=''
          disabled={disabled || !app}
          aria-describedby={describedBy}
          onClick={() => setOpen('create')}
        >
          <Plus className='size-4' aria-hidden='true' />
          New role
        </Button>
      )}
    </Can>
  )
}
