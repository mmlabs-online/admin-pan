import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { loadTurnstile } from '@/lib/turnstile-loader'
import { Button } from '@/components/ui/button'

export type TurnstileHandle = { reset: () => void }

type Props = {
  onToken: (token: string | null) => void
  ref?: React.Ref<TurnstileHandle>
}

export function Turnstile({ onToken, ref }: Props) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const apiRef = useRef<Awaited<ReturnType<typeof loadTurnstile>> | null>(null)
  const onTokenRef = useRef(onToken)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [widgetError, setWidgetError] = useState(false)

  useEffect(() => {
    onTokenRef.current = onToken
  })

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current(null)
      if (apiRef.current && widget.current) {
        apiRef.current.reset(widget.current)
      }
    },
  }))

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    loadTurnstile().then(
      (api) => {
        if (cancelled || !box.current) return
        apiRef.current = api
        widget.current = api.render(box.current, {
          sitekey: siteKey,
          callback: (t) => {
            setWidgetError(false)
            onTokenRef.current(t)
          },
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            setWidgetError(true)
            onTokenRef.current(null)
          },
        })
      },
      () => {
        if (!cancelled) setFailed(true)
      }
    )
    return () => {
      cancelled = true
      if (apiRef.current && widget.current)
        apiRef.current.remove(widget.current)
      widget.current = null
    }
  }, [siteKey, attempt])

  if (!siteKey) {
    return (
      <p role='alert' className='text-sm text-destructive'>
        Verification is not configured.
      </p>
    )
  }
  if (failed) {
    return (
      <div role='alert' className='grid gap-2 text-sm text-destructive'>
        <p>The verification could not be loaded.</p>
        <Button
          type='button'
          variant='outline'
          onClick={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        >
          Retry
        </Button>
      </div>
    )
  }
  return (
    <>
      <div ref={box} />
      {widgetError && (
        <div role='alert' className='grid gap-2 text-sm text-destructive'>
          <p>Verification failed. Retry the check or reload the page.</p>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              setWidgetError(false)
              if (apiRef.current && widget.current) {
                apiRef.current.reset(widget.current)
              }
            }}
          >
            Retry
          </Button>
        </div>
      )}
    </>
  )
}
