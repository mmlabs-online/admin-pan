import { getRouteApi } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { AppsDialogs } from './components/apps-dialogs'
import { AppsProvider, useApps } from './components/apps-provider'
import { AppsTable } from './components/apps-table'

const route = getRouteApi('/_authenticated/apps/')

export function Apps() {
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
        <AppsContent search={search} navigate={navigate} />
      </Main>
    </>
  )
}

type AppsContentProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

/** Page body without the router-bound shell, so it can be tested directly. */
export function AppsContent({ search, navigate }: AppsContentProps) {
  return (
    <AppsProvider>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Apps</h2>
          <p className='text-muted-foreground'>
            Registered apps, their join policy, origins and permissions.
          </p>
        </div>
        <RegisterAppButton />
      </div>
      <AppsTable search={search} navigate={navigate} />
      <AppsDialogs />
    </AppsProvider>
  )
}

function RegisterAppButton() {
  const { setOpen } = useApps()
  // admin:apps:write (planned name)
  return (
    <Button onClick={() => setOpen('create')}>
      <Plus className='size-4' />
      Register app
    </Button>
  )
}
