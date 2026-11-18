import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { ROUTE_PERMISSIONS } from '@/lib/permissions/registry'
import { usePermission } from '@/context/permission-provider'
import { type AttentionItem } from '../data/view'
import { formatCount } from '../lib/format'

const rowClass =
  'flex items-center justify-between gap-2 rounded-md py-3 text-sm'

export function AttentionList({ items }: { items: AttentionItem[] }) {
  // Hide the link when the destination is known to be denied (R4). The API
  // stays the gate.
  const audit = usePermission(ROUTE_PERMISSIONS['/_authenticated/audit-log/'])
  return (
    <ul className='divide-y'>
      {items.map((item) => (
        <li key={item.id}>
          {item.to && audit !== 'denied' ? (
            <Link
              to={item.to}
              search={item.search}
              className={`${rowClass} hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
            >
              <span>{item.label}</span>
              <span className='flex items-center gap-1 font-semibold'>
                {formatCount(item.count)}
                <span className='sr-only'>, open in the audit log</span>
                <ChevronRight
                  className='size-4 text-muted-foreground'
                  aria-hidden
                />
              </span>
            </Link>
          ) : (
            <div className={rowClass}>
              <span>{item.label}</span>
              <span className='font-semibold'>{formatCount(item.count)}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
