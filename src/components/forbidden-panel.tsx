import { useId } from 'react'
import { type ForbiddenCopy } from '@/lib/forbidden'
import { Button } from '@/components/ui/button'

type ForbiddenPanelProps = {
  copy: ForbiddenCopy
  variant?: 'page' | 'inline'
  onRetry?: () => void
  onBack?: () => void
}

/** In-place 403 state. All text is rendered as React text (R6). */
export function ForbiddenPanel({
  copy,
  variant = 'page',
  onRetry,
  onBack,
}: ForbiddenPanelProps) {
  const titleId = useId()
  const required = copy.required && (
    <p className='text-sm text-muted-foreground'>
      Required permission: <code>{copy.required}</code>
    </p>
  )

  if (variant === 'inline')
    return (
      <div role='alert' className='space-y-1 text-sm'>
        <p className='font-medium'>{copy.title}</p>
        <p className='text-muted-foreground'>{copy.description}</p>
        {required}
      </div>
    )

  return (
    <section
      aria-labelledby={titleId}
      className='mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center'
    >
      <h2 id={titleId} className='text-2xl font-bold'>
        {copy.title}
      </h2>
      <div role='alert' className='space-y-1'>
        <p className='text-muted-foreground'>{copy.description}</p>
        {required}
      </div>
      <div className='mt-2 flex gap-2'>
        {onBack && (
          <Button variant='outline' onClick={onBack}>
            Go back
          </Button>
        )}
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
      </div>
    </section>
  )
}
