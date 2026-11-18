import { type Column } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SortButtonProps<TData, TValue> = {
  column: Column<TData, TValue>
  title: string
}

/**
 * Header control for a column the API can sort by. The sort state itself is
 * exposed as `aria-sort` on the `<th>` by the table; the button text stays the
 * plain column title.
 */
export function SortButton<TData, TValue>({
  column,
  title,
}: SortButtonProps<TData, TValue>) {
  if (!column.getCanSort()) return <span>{title}</span>
  const sorted = column.getIsSorted()
  const Icon =
    sorted === 'desc' ? ArrowDown : sorted === 'asc' ? ArrowUp : ChevronsUpDown
  return (
    <Button
      variant='ghost'
      size='sm'
      className='-ms-3 h-8'
      onClick={column.getToggleSortingHandler()}
    >
      <span>{title}</span>
      <Icon aria-hidden='true' />
    </Button>
  )
}
