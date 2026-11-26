import { Button } from '@/components/ui/button'

// Shared by the Members and Invitations tabs. `aria-disabled`, not `disabled`,
// like the other pagers, so the buttons keep focus.
export function OffsetPager({
  offset,
  pageSize,
  total,
  noun,
  onOffsetChange,
}: {
  offset: number
  pageSize: number
  total: number
  noun: string
  onOffsetChange: (offset: number) => void
}) {
  if (total <= pageSize) return null
  const from = total ? offset + 1 : 0
  const to = Math.min(offset + pageSize, total)
  const disabledClass =
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
  return (
    <div className='flex items-center justify-between gap-2'>
      <p role='status' aria-live='polite' className='text-sm'>
        Showing {from}–{to} of {total} {noun}
      </p>
      <div className='flex gap-2'>
        <Button
          size='sm'
          variant='outline'
          className={disabledClass}
          aria-disabled={offset === 0}
          onClick={() => {
            if (offset === 0) return
            onOffsetChange(Math.max(0, offset - pageSize))
          }}
        >
          Previous
        </Button>
        <Button
          size='sm'
          variant='outline'
          className={disabledClass}
          aria-disabled={to >= total}
          onClick={() => {
            if (to >= total) return
            onOffsetChange(offset + pageSize)
          }}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
