import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type AppMembers,
  type DailySignIns,
  type MonthlySignups,
} from '../data/stats'

const axis = {
  stroke: '#888888',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
}

export function SignupsChart({ data }: { data: MonthlySignups[] }) {
  return (
    <div
      role='img'
      aria-label='Bar chart of new sign-ups per month for the last 12 months'
    >
      <ResponsiveContainer width='100%' height={300}>
        <BarChart data={data}>
          <XAxis dataKey='month' {...axis} />
          <YAxis direction='ltr' allowDecimals={false} {...axis} />
          <Tooltip cursor={{ fillOpacity: 0.1 }} />
          <Bar
            dataKey='signups'
            name='Sign-ups'
            fill='currentColor'
            radius={[4, 4, 0, 0]}
            className='fill-primary'
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SignInsChart({ data }: { data: DailySignIns[] }) {
  return (
    <div
      role='img'
      aria-label='Line chart of successful and failed sign-ins per day this week'
    >
      <ResponsiveContainer width='100%' height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray='3 3' className='stroke-muted' />
          <XAxis dataKey='day' {...axis} />
          <YAxis direction='ltr' allowDecimals={false} {...axis} />
          <Tooltip />
          <Legend />
          <Line
            type='monotone'
            dataKey='success'
            name='Successful'
            stroke='#0d9488'
            strokeWidth={2}
          />
          <Line
            type='monotone'
            dataKey='failure'
            name='Failed'
            stroke='#dc2626'
            strokeWidth={2}
            strokeDasharray='4 2'
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MembersByAppChart({ data }: { data: AppMembers[] }) {
  return (
    <div role='img' aria-label='Horizontal bar chart of members per app'>
      <ResponsiveContainer width='100%' height={300}>
        <BarChart data={data} layout='vertical' margin={{ left: 24 }}>
          <XAxis type='number' allowDecimals={false} {...axis} />
          <YAxis type='category' dataKey='app_key' width={80} {...axis} />
          <Tooltip cursor={{ fillOpacity: 0.1 }} />
          <Bar
            dataKey='members'
            name='Members'
            fill='currentColor'
            radius={[0, 4, 4, 0]}
            className='fill-primary'
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
