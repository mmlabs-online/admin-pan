import {
  Activity,
  Building2,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type Kpi } from '../data/stats'
import { formatChange } from '../lib/format'

const icons = {
  users: Users,
  organizations: Building2,
  apps: Package,
  sign_ins_24h: Activity,
} satisfies Record<Kpi['key'], React.ElementType>

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {items.map((kpi) => {
        const Icon = icons[kpi.key]
        const Trend = kpi.change_pct < 0 ? TrendingDown : TrendingUp
        return (
          <Card key={kpi.key}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{kpi.label}</CardTitle>
              <Icon className='size-4 text-muted-foreground' aria-hidden />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {kpi.value.toLocaleString('en-US')}
              </div>
              <p
                className={cn(
                  'flex items-center gap-1 text-xs text-muted-foreground',
                  kpi.change_pct < 0 && 'text-destructive'
                )}
              >
                {kpi.change_pct !== 0 && (
                  <Trend className='size-3' aria-hidden />
                )}
                {formatChange(kpi.change_pct)} {kpi.period}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
