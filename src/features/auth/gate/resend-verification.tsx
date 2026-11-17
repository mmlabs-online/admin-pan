import { useEffect, useRef, useState } from 'react'
import { resendVerificationEmail } from '@/api'
import { useAuth } from '@mmlabs/auth-client/react'
import { Loader2 } from 'lucide-react'
import { formatRetryAfter } from '@/lib/retry-after'
import { useCountdown } from '@/hooks/use-countdown'
import { Button } from '@/components/ui/button'

const SENT =
  'If this address still needs verifying, a new link is on its way. It can take a few minutes, and only the newest link works.'
const NOT_ALLOWED =
  "A new link can't be sent from mmlabs Admin for this account. Request one from another mmlabs app you use, or contact an administrator."

type Alert = { text: string; requestId?: string }

export function ResendVerification({
  accountId,
  busy,
  setBusy,
  onAlreadyVerified,
}: {
  accountId: string
  busy: boolean
  setBusy: (busy: boolean) => void
  onAlreadyVerified: () => Promise<void>
}) {
  const { reload } = useAuth()
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const [status, setStatus] = useState('')
  const [alert, setAlert] = useState<Alert | null>(null)
  const [until, setUntil] = useState<number | null>(null)
  const remaining = useCountdown(until)
  const wasWaiting = useRef(false)

  // The only re-enable announcement; the ticking text is not live.
  useEffect(() => {
    if (remaining > 0) {
      wasWaiting.current = true
    } else if (wasWaiting.current) {
      wasWaiting.current = false
      setUntil(null)
      setStatus('You can send the link again.')
    }
  }, [remaining])

  async function onClick() {
    if (inFlight.current || busy || remaining > 0) return
    inFlight.current = true
    setBusy(true)
    setPending(true)
    setAlert(null)
    setStatus('Sending…')
    try {
      const r = await resendVerificationEmail(accountId)
      switch (r.kind) {
        case 'sent':
          setStatus(SENT)
          break
        case 'already_verified':
          setStatus('Your email address is already verified. Continuing…')
          await onAlreadyVerified()
          break
        case 'rate_limited':
          setStatus('')
          setAlert({
            text: `Too many requests. Try again in ${formatRetryAfter(r.retryAfter)}.`,
          })
          setUntil(Date.now() + Math.max(1, r.retryAfter ?? 60) * 1000)
          break
        case 'not_allowed':
          setStatus('')
          setAlert({ text: NOT_ALLOWED, requestId: r.requestId })
          break
        case 'config':
          setStatus('')
          setAlert({
            text: 'The app is not configured correctly for mmlabs Identity.',
            requestId: r.requestId,
          })
          break
        case 'session_invalid':
        case 'account_changed':
        case 'no_account_selected':
          setStatus('')
          void reload()
          break
        case 'network':
          setStatus('')
          setAlert({ text: 'Could not reach the server. Please try again.' })
          break
        default:
          setStatus('')
          setAlert({
            text: 'Something went wrong. Please try again later.',
            requestId: 'requestId' in r ? r.requestId : undefined,
          })
      }
    } finally {
      inFlight.current = false
      setPending(false)
      setBusy(false)
    }
  }

  const disabled = pending || busy || remaining > 0
  return (
    <div className='flex flex-col gap-2'>
      <p role='status' className='sr-only'>
        {status}
      </p>
      {alert && (
        <div role='alert' className='text-sm text-destructive'>
          <p>{alert.text}</p>
          {alert.requestId && <p>Request ID: {alert.requestId}</p>}
        </div>
      )}
      {/* aria-disabled keeps focus on the button (WCAG 2.4.3) */}
      <Button
        type='button'
        variant='outline'
        onClick={() => void onClick()}
        aria-disabled={disabled || undefined}
        aria-describedby={remaining > 0 ? 'resend-wait' : undefined}
        className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
      >
        Send the link again
        {pending && <Loader2 className='animate-spin' aria-hidden />}
      </Button>
      {remaining > 0 && (
        <p id='resend-wait' className='text-sm text-muted-foreground'>
          You can send the link again in {formatRetryAfter(remaining)}.
        </p>
      )}
    </div>
  )
}
