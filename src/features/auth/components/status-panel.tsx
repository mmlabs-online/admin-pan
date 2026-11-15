import { useEffect, useRef } from 'react'

/** Status message whose heading takes focus on mount (keyboard / SR users). */
export function StatusPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <div role='status' className='grid gap-2 text-sm'>
      <h2 ref={heading} tabIndex={-1} className='font-medium outline-none'>
        {title}
      </h2>
      {children}
    </div>
  )
}
