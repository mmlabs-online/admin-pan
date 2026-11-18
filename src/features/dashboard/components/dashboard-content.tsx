import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { getApi, type ApiClient } from '@/api'
import { RefreshCw } from 'lucide-react'
import { queryView } from '@/lib/query-view'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { dashboardStatsQueryOptions } from '../api/queries'
import { toAttentionItems, toKpis, toSignupRows } from '../data/view'
import { AttentionList } from './attention-list'
import { MEMBERS_NOTE, MembersByAppChart, SignupsChart } from './charts'
import { KpiCards } from './kpi-cards'

export function DashboardContent({ api = getApi() }: { api?: ApiClient }) {
  const q = useQuery(dashboardStatsQueryOptions(api))
  const view = queryView(q)
  const busy = view.status === 'pending' || q.isFetching
  const status = q.isFetching
    ? view.status === 'pending'
      ? 'Loading dashboard…'
      : 'Refreshing…'
    : ''

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-end gap-3'>
        {view.status === 'success' && (
          <p className='text-sm text-muted-foreground'>
            Updated{' '}
            <time dateTime={view.data.generated_at}>
              {format(new Date(view.data.generated_at), 'MMM d, HH:mm')}
            </time>
          </p>
        )}
        <Button
          variant='outline'
          size='sm'
          aria-disabled={q.isFetching || undefined}
          onClick={() => {
            if (!q.isFetching) void q.refetch()
          }}
        >
          <RefreshCw aria-hidden />
          {q.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
        <p role='status' aria-live='polite' className='sr-only'>
          {status}
        </p>
      </div>

      <section aria-label='Dashboard statistics' aria-busy={busy}>
        {view.status === 'pending' && (
          <div aria-hidden className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className='h-28' />
              ))}
            </div>
            <div className='grid gap-4 lg:grid-cols-7'>
              <Skeleton className='h-80 lg:col-span-4' />
              <Skeleton className='h-80 lg:col-span-3' />
            </div>
          </div>
        )}
        {view.status === 'forbidden' && (
          <ForbiddenPanel
            variant='page'
            copy={view.copy}
            onRetry={() => void q.refetch()}
          />
        )}
        {view.status === 'error' && (
          <div role='alert' className='space-y-2'>
            <p>Couldn&apos;t load the dashboard.</p>
            <Button size='sm' onClick={() => void q.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {view.status === 'success' && (
          <div className='space-y-4'>
            <KpiCards items={toKpis(view.data)} />
            <p className='text-sm text-muted-foreground'>
              Sign-ins are events in the last 24 h, not people. Failed sign-ins
              include unknown emails and exclude requests refused by rate
              limiting or Turnstile.
            </p>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <Card className='lg:col-span-4'>
                <CardHeader>
                  <CardTitle>New sign-ups</CardTitle>
                  <CardDescription>
                    mmlabs accounts created per month, last 12 months (
                    {view.data.sign_ups.time_zone}). Includes CLI-created
                    accounts.
                    {view.data.sign_ups.by_month.length > 0 &&
                      ` ${lastMonthLabel(view.data)} is partial (month so far).`}
                  </CardDescription>
                </CardHeader>
                <CardContent className='ps-2'>
                  <SignupsChart
                    rows={toSignupRows(view.data)}
                    timeZone={view.data.sign_ups.time_zone}
                  />
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
                  <AttentionList items={toAttentionItems(view.data)} />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Members per app</CardTitle>
                <CardDescription>{MEMBERS_NOTE}</CardDescription>
              </CardHeader>
              <CardContent className='ps-2'>
                <MembersByAppChart items={view.data.members_per_app} />
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </div>
  )
}

function lastMonthLabel(s: Parameters<typeof toSignupRows>[0]) {
  const rows = toSignupRows(s)
  return rows[rows.length - 1].label.replace(' (partial)', '')
}
