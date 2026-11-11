import { useId, useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { reportStatuses } from '../data/data'
import { membersPerApp, signupsPerWeek } from '../data/reports'
import { useReports } from './reports-provider'

type Datum = { label: string; value: number }

type ChartCardProps = {
  title: string
  description: string
  valueLabel: string
  data: Datum[]
  layout?: 'horizontal' | 'vertical'
}

/**
 * Bar chart card. The SVG is hidden from assistive tech and the same data is
 * exposed as a visually hidden table (WCAG 1.1.1).
 */
function ChartCard({
  title,
  description,
  valueLabel,
  data,
  layout = 'horizontal',
}: ChartCardProps) {
  const titleId = useId()
  const descId = useId()
  const vertical = layout === 'vertical'

  return (
    <Card role='figure' aria-labelledby={titleId} aria-describedby={descId}>
      <CardHeader>
        <CardTitle id={titleId} role='heading' aria-level={3}>
          {title}
        </CardTitle>
        <CardDescription id={descId}>{description}</CardDescription>
      </CardHeader>
      <CardContent className='ps-2'>
        <div aria-hidden='true'>
          <ResponsiveContainer width='100%' height={280}>
            <BarChart
              data={data}
              layout={layout}
              accessibilityLayer={false}
              margin={{ left: vertical ? 16 : 0, right: 16 }}
            >
              <CartesianGrid
                strokeDasharray='3 3'
                className='stroke-border'
                vertical={vertical}
                horizontal={!vertical}
              />
              {vertical ? (
                <>
                  <XAxis
                    type='number'
                    stroke='#888888'
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type='category'
                    dataKey='label'
                    stroke='#888888'
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey='label'
                    stroke='#888888'
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    direction='ltr'
                    stroke='#888888'
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                </>
              )}
              <Tooltip
                cursor={{ className: 'fill-muted' }}
                contentStyle={{
                  background: 'var(--popover)',
                  color: 'var(--popover-foreground)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                }}
                formatter={(value) => [value, valueLabel]}
              />
              <Bar
                dataKey='value'
                name={valueLabel}
                fill='currentColor'
                className='fill-primary'
                radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className='sr-only'>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope='col'>{vertical ? 'Category' : 'Period'}</th>
              <th scope='col'>{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope='row'>{d.label}</th>
                <td>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

const signupsData: Datum[] = signupsPerWeek.map((w) => ({
  label: w.week_start.slice(5),
  value: w.signups,
}))

const membersData: Datum[] = membersPerApp.map((a) => ({
  label: a.app_key,
  value: a.members,
}))

export function ReportsOverview() {
  const { reports } = useReports()

  const statusData: Datum[] = useMemo(
    () =>
      reportStatuses.map((s) => ({
        label: s.label,
        value: reports.filter((r) => r.status === s.value).length,
      })),
    [reports]
  )

  const totalSignups = signupsPerWeek.reduce((sum, w) => sum + w.signups, 0)
  const totalMembers = membersPerApp.reduce((sum, a) => sum + a.members, 0)

  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <ChartCard
        title='Sign-ups per week'
        description={`New user sign-ups across all apps over the last 12 weeks (${totalSignups.toLocaleString('en-US')} total). Weeks start on the date shown (MM-DD).`}
        valueLabel='Sign-ups'
        data={signupsData}
      />
      <ChartCard
        title='Members per app'
        description={`Users with a membership in each app (${totalMembers.toLocaleString('en-US')} memberships total).`}
        valueLabel='Members'
        data={membersData}
        layout='vertical'
      />
      <div className='lg:col-span-2'>
        <ChartCard
          title='Reports by status'
          description='Number of report definitions in each status right now.'
          valueLabel='Reports'
          data={statusData}
        />
      </div>
    </div>
  )
}
