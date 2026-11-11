import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { type AttentionItem } from '../data/stats'

export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <ul className='divide-y'>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            to={item.to}
            className='flex items-center justify-between gap-2 rounded-md py-3 text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
          >
            <span>{item.label}</span>
            <span className='flex items-center gap-1 font-semibold'>
              {item.count}
              <ChevronRight
                className='size-4 text-muted-foreground'
                aria-hidden
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
