import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { type DashboardStats } from '../api/queries'
import { type SignupRow } from '../data/view'
import { formatCount } from '../lib/format'

// Theme colour (not a fixed grey) so the axis text keeps its contrast (R10).
const axis = {
  stroke: 'currentColor',
  tick: { fill: 'currentColor' },
  fontSize: 12,
  tickLine: false,
  axisLine: false,
}

export const MEMBERS_NOTE =
  'Distinct active users with a non-expired role in each app (app scope or any organization). Includes the admin app and disabled apps.'

export function SignupsChart({
  rows,
  timeZone,
}: {
  rows: SignupRow[]
  timeZone: string
}) {
  if (!rows.length)
    return <p className='text-sm text-muted-foreground'>No sign-up data.</p>
  return (
    <div className='space-y-2'>
      <div
        role='img'
        aria-label='Bar chart of new accounts per month; the data is in the table below'
        className='text-muted-foreground'
      >
        <ResponsiveContainer width='100%' height={300}>
          <BarChart data={rows}>
            <XAxis dataKey='tick' {...axis} />
            <YAxis direction='ltr' allowDecimals={false} {...axis} />
            <Tooltip cursor={{ fillOpacity: 0.1 }} />
            <Bar
              dataKey='count'
              name='New accounts'
              radius={[4, 4, 0, 0]}
              className='fill-primary'
            >
              {rows.map((r) => (
                <Cell key={r.month} fillOpacity={r.partial ? 0.45 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary className='cursor-pointer text-sm'>Show data as table</summary>
        <Table>
          <TableCaption>
            New accounts per month ({timeZone}); the last month is partial
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope='col'>Month</TableHead>
              <TableHead scope='col'>New accounts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell>{r.label}</TableCell>
                <TableCell>{formatCount(r.count)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </div>
  )
}

export function MembersByAppChart({
  items,
}: {
  items: DashboardStats['members_per_app']
}) {
  if (!items.length)
    return <p className='text-sm text-muted-foreground'>No apps yet.</p>
  return (
    <div className='space-y-2'>
      <div
        role='img'
        aria-label='Horizontal bar chart of members per app; the data is in the table below'
        className='text-muted-foreground'
      >
        <ResponsiveContainer width='100%' height={300}>
          <BarChart data={items} layout='vertical' margin={{ left: 24 }}>
            <XAxis type='number' allowDecimals={false} {...axis} />
            <YAxis type='category' dataKey='app_key' width={96} {...axis} />
            <Tooltip cursor={{ fillOpacity: 0.1 }} />
            <Bar
              dataKey='member_count'
              name='Members'
              radius={[0, 4, 4, 0]}
              className='fill-primary'
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary className='cursor-pointer text-sm'>Show data as table</summary>
        <Table>
          <TableCaption>{MEMBERS_NOTE}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope='col'>App</TableHead>
              <TableHead scope='col'>Key</TableHead>
              <TableHead scope='col'>Members</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a.app_key}>
                <TableCell>{a.name}</TableCell>
                <TableCell className='font-mono'>{a.app_key}</TableCell>
                <TableCell>{formatCount(a.member_count)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </div>
  )
}
