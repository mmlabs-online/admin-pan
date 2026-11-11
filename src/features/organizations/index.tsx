import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { OrganizationsDialogs } from './components/organizations-dialogs'
import { OrganizationsPrimaryButtons } from './components/organizations-primary-buttons'
import {
  OrganizationsProvider,
  useOrganizations,
} from './components/organizations-provider'
import { OrganizationsTable } from './components/organizations-table'

const route = getRouteApi('/_authenticated/organizations/')

// Route permission: admin:orgs:read (planned name)
export function Organizations() {
  return (
    <OrganizationsProvider>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Organizations</h2>
            <p className='text-muted-foreground'>
              Customer organizations across mmlabs apps.
            </p>
          </div>
          <OrganizationsPrimaryButtons />
        </div>
        <OrganizationsTableSection />
      </Main>

      <OrganizationsDialogs />
    </OrganizationsProvider>
  )
}

function OrganizationsTableSection() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { organizations } = useOrganizations()
  return (
    <OrganizationsTable
      data={organizations}
      search={search}
      navigate={navigate}
    />
  )
}
