import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { isApiError, type ApiClient } from '@/api'
import { Loader2 } from 'lucide-react'
import { formatRetryAfter } from '@/lib/retry-after'
import { Button } from '@/components/ui/button'
import { useVerifyEmailMutation } from '../../api/mutations'
import { StatusPanel } from '../../components/status-panel'

type Status = 'idle' | 'verified' | 'invalid'

const linkClass = 'underline underline-offset-4 hover:text-primary'

const SignInLink = () => (
  <Link to='/sign-in' className={linkClass}>
    Sign in
  </Link>
)

export function InvalidVerifyLink() {
  return (
    <StatusPanel title='Invalid link'>
      <p>This link is invalid. Sign in to request a new one.</p>
      <SignInLink />
    </StatusPanel>
  )
}

export function VerifyEmailPanel({
  token,
  api,
}: {
  token: string
  api?: () => ApiClient
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const mutation = useVerifyEmailMutation(api)

  // Only an explicit click sends the request (mail scanners must not verify).
  function onConfirm() {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    mutation.mutate(
      { token },
      {
        onSuccess: () => {
          setStatus('verified')
          mutation.reset()
        },
        onError: (e) => {
          if (isApiError(e, 422)) {
            setStatus('invalid')
            mutation.reset()
          } else if (isApiError(e, 429)) {
            setError(
              `Too many requests. Try again in ${formatRetryAfter(e.retryAfter)}.`
            )
          } else if (isApiError(e) && ['network', 'timeout'].includes(e.kind)) {
            setError('Could not reach the server. Please try again.')
          } else {
            setError('Something went wrong. Please try again later.')
          }
        },
        onSettled: () => {
          inFlight.current = false
        },
      }
    )
  }

  if (status === 'verified') {
    return (
      <StatusPanel title='Email address verified'>
        <p>Your email address is verified. You can now sign in.</p>
        <SignInLink />
      </StatusPanel>
    )
  }
  if (status === 'invalid') {
    return (
      <StatusPanel title='Link invalid or expired'>
        <p>
          This link is invalid, expired or already used. Sign in to request a
          new one.
        </p>
        <SignInLink />
      </StatusPanel>
    )
  }

  return (
    <div className='grid gap-2 text-sm'>
      <p>Confirm the email address for your mmlabs account.</p>
      <p role='status' className='sr-only'>
        {mutation.isPending ? 'Verifying…' : ''}
      </p>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {/* aria-disabled (not disabled) keeps focus on the button while pending,
          so it is still focused after a 429 or network error (WCAG 2.4.3).
          Double clicks are blocked by the inFlight ref in onConfirm. */}
      <Button
        type='button'
        onClick={onConfirm}
        aria-disabled={mutation.isPending || undefined}
        className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
      >
        Confirm my email
        {mutation.isPending && <Loader2 className='animate-spin' />}
      </Button>
    </div>
  )
}
