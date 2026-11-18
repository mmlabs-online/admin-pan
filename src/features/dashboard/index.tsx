import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { DashboardContent } from './components/dashboard-content'

// Route permission: admin:stats:read
export function Dashboard() {
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-2 space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>Dashboard</h1>
          <p className='text-muted-foreground'>
            The mmlabs ecosystem at a glance. Counts are approximate.
          </p>
        </div>
        <DashboardContent />
      </Main>
    </>
  )
}
