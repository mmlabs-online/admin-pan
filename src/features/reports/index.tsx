import { getRouteApi } from '@tanstack/react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ReportsDialogs } from './components/reports-dialogs'
import { ReportsOverview } from './components/reports-overview'
import { ReportsPrimaryButtons } from './components/reports-primary-buttons'
import { ReportsProvider, useReports } from './components/reports-provider'
import { ReportsTable } from './components/reports-table'

const route = getRouteApi('/_authenticated/reports/')

function ReportsList() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { reports } = useReports()
  return <ReportsTable data={reports} search={search} navigate={navigate} />
}

// admin:reports:read (planned name)
export function Reports() {
  return (
    <ReportsProvider>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Reports</h1>
            <p className='text-muted-foreground'>
              Define, run and export operational reports.
            </p>
          </div>
          <ReportsPrimaryButtons />
        </div>
        <Tabs defaultValue='reports' className='flex-1 gap-4'>
          <TabsList>
            <TabsTrigger value='reports'>Reports</TabsTrigger>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
          </TabsList>
          <TabsContent value='reports' className='flex flex-col'>
            <ReportsList />
          </TabsContent>
          <TabsContent value='overview'>
            <ReportsOverview />
          </TabsContent>
        </Tabs>
      </Main>

      <ReportsDialogs />
    </ReportsProvider>
  )
}
