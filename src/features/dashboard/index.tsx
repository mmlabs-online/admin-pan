import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { AttentionList } from './components/attention-list'
import {
  MembersByAppChart,
  SignInsChart,
  SignupsChart,
} from './components/charts'
import { KpiCards } from './components/kpi-cards'
import { RecentActivity } from './components/recent-activity'
import {
  attentionItems,
  dailySignIns,
  kpis,
  membersByApp,
  monthlySignups,
  recentEvents,
} from './data/stats'

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
            The mmlabs ecosystem at a glance. Sample data until the API provides
            stats.
          </p>
        </div>
        <Tabs defaultValue='overview' className='space-y-4'>
          <div className='w-full overflow-x-auto pb-2'>
            <TabsList>
              <TabsTrigger value='overview'>Overview</TabsTrigger>
              <TabsTrigger value='activity'>Activity</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value='overview' className='space-y-4'>
            <KpiCards items={kpis} />
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <Card className='lg:col-span-4'>
                <CardHeader>
                  <CardTitle>New sign-ups</CardTitle>
                  <CardDescription>
                    mmlabs accounts created per month
                  </CardDescription>
                </CardHeader>
                <CardContent className='ps-2'>
                  <SignupsChart data={monthlySignups} />
                </CardContent>
              </Card>
              <Card className='lg:col-span-3'>
                <CardHeader>
                  <CardTitle>Needs attention</CardTitle>
                  <CardDescription>
                    Items staff usually follow up on
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AttentionList items={attentionItems} />
                </CardContent>
              </Card>
            </div>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <Card className='lg:col-span-4'>
                <CardHeader>
                  <CardTitle>Members per app</CardTitle>
                  <CardDescription>
                    Users with a role in each app
                  </CardDescription>
                </CardHeader>
                <CardContent className='ps-2'>
                  <MembersByAppChart data={membersByApp} />
                </CardContent>
              </Card>
              <Card className='lg:col-span-3'>
                <CardHeader>
                  <CardTitle>Recent admin activity</CardTitle>
                  <CardDescription>Latest audit log entries</CardDescription>
                </CardHeader>
                <CardContent>
                  <RecentActivity events={recentEvents} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value='activity' className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Sign-ins this week</CardTitle>
                <CardDescription>
                  Successful and failed sign-ins per day
                </CardDescription>
              </CardHeader>
              <CardContent className='px-6'>
                <SignInsChart data={dailySignIns} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}
