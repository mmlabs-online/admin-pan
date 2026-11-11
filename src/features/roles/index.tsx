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
}

/** Page body without the router-bound shell, so it can be tested directly. */
export function RolesContent({ search, navigate }: RolesContentProps) {
  return (
    <RolesProvider>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Roles</h2>
          <p className='text-muted-foreground'>
            Roles of every app, their permissions and who holds them.
          </p>
        </div>
        <NewRoleButton />
      </div>
      <RolesTable search={search} navigate={navigate} />
      <RolesDialogs />
    </RolesProvider>
  )
}

function NewRoleButton() {
  const { setOpen } = useRoles()
  // admin:apps:write (planned name)
  return (
    <Button onClick={() => setOpen('create')}>
      <Plus className='size-4' />
      New role
    </Button>
  )
}
