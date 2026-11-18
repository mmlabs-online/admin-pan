import { Activity, Building2, Package, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type Kpi } from '../data/view'
import { formatCount } from '../lib/format'

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
        return (
          <Card key={kpi.key}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{kpi.label}</CardTitle>
              <Icon className='size-4 text-muted-foreground' aria-hidden />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{formatCount(kpi.value)}</div>
              <p className='text-xs text-muted-foreground'>{kpi.detail}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
