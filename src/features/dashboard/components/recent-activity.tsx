import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { type RecentEvent } from '../data/stats'

export function RecentActivity({ events }: { events: RecentEvent[] }) {
  return (
    <ul className='space-y-4'>
      {events.map((event) => (
        <li
          key={event.id}
          className='flex flex-wrap items-start justify-between gap-2'
        >
          <div className='space-y-1'>
            <Badge variant='outline' className='font-mono'>
              {event.action}
            </Badge>
            <p className='text-sm'>{event.target}</p>
            <p className='text-xs text-muted-foreground'>
              by {event.actor_email ?? 'anonymous'}
            </p>
          </div>
          <time
            dateTime={event.occurred_at}
            className='text-xs text-muted-foreground'
          >
            {format(new Date(event.occurred_at), 'MMM d, HH:mm')}
          </time>
        </li>
      ))}
    </ul>
  )
}
