import { useRef, useState } from 'react'
import { useAuth } from '@mmlabs/auth-client/react'
import { Loader2 } from 'lucide-react'
import { formatRetryAfter } from '@/lib/retry-after'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { StatusPanel } from '../components/status-panel'
import { AccountList, SignOutButton, UseAnotherAccount } from './account-picker'
import { ResendVerification } from './resend-verification'
import type { AccessState } from './use-access-check'

export function BootSpinner() {
  return (
    <div
      role='status'
      aria-live='polite'
      className='flex h-svh items-center justify-center gap-2 text-sm text-muted-foreground'
    >
      <Loader2 className='animate-spin' aria-hidden />
      Restoring your session…
    </div>
  )
}

export function AccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthLayout>
      <Card className='mx-auto w-full max-w-sm gap-4'>
        <CardContent>{children}</CardContent>
      </Card>
    </AuthLayout>
  )
}

function useCurrentAccount() {
  const { accounts, accountId } = useAuth()
  return {
    accountId: accountId ?? undefined,
    email:
      accounts.find((a) => a.accountId === accountId)?.email ?? 'This account',
  }
}

export function NotMemberPage() {
  const { accountId, email } = useCurrentAccount()
  return (
    <AccessLayout>
      <StatusPanel title='No access to the admin app'>
        <p>
          {email} is signed in, but this account does not have access to mmlabs
          Admin. Ask an administrator to grant access.
        </p>
        <AccountList exclude={accountId} />
        <UseAnotherAccount />
        <SignOutButton scope='account' />
      </StatusPanel>
    </AccessLayout>
  )
}

function waitMessage(retryAfter?: number) {
  return `Too many requests. Try again in ${formatRetryAfter(retryAfter)}.`
}

export function EmailUnverifiedPage({
  onContinue,
}: {
  onContinue: () => Promise<AccessState>
}) {
  const { accountId, email } = useCurrentAccount()
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [alert, setAlert] = useState<string | null>(null)

  async function runContinue() {
    setBusy(true)
    setAlert(null)
    const result = await onContinue()
    setBusy(false)
    if (result.kind === 'email_unverified')
      setAlert('Your email address is still not verified.')
    else if (result.kind === 'rate_limited')
      setAlert(waitMessage(result.retryAfter))
    else if (result.kind === 'network')
      setAlert('Could not reach the server. Please try again.')
    else if (result.kind !== 'ok' && result.kind !== 'checking')
      setAlert('Something went wrong. Please try again later.')
  }

  async function onClick() {
    if (inFlight.current || busy) return
    inFlight.current = true
    try {
      await runContinue()
    } finally {
      inFlight.current = false
    }
  }

  return (
    <AccessLayout>
      <StatusPanel title='Verify your email address'>
        <p>
          {email} has not been verified yet. Open the verification email we sent
          you and follow its link, then come back and continue. If you
          can&apos;t find the email or the link has expired, send the link
          again.
        </p>
      </StatusPanel>
      {/* Outside StatusPanel (role=status): no live region nests another */}
      <div className='grid gap-2 text-sm'>
        {accountId && (
          <ResendVerification
            accountId={accountId}
            busy={busy}
            setBusy={setBusy}
            onAlreadyVerified={runContinue}
          />
        )}
        {alert && (
          <p role='alert' className='text-sm text-destructive'>
            {alert}
          </p>
        )}
        {/* aria-disabled keeps focus on the button while pending (WCAG 2.4.3) */}
        <Button
          type='button'
          onClick={() => void onClick()}
          aria-disabled={busy || undefined}
          className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
        >
          I&apos;ve verified, continue
          {busy && <Loader2 className='animate-spin' />}
        </Button>
        <AccountList exclude={accountId} />
        <UseAnotherAccount />
        <SignOutButton scope='account' />
      </div>
    </AccessLayout>
  )
}

export type GateMessageKind =
  | { kind: 'accounts_error' }
  | Extract<
      AccessState,
      { kind: 'rate_limited' | 'network' | 'config' | 'rejected' }
    >

export function GateMessage({
  message,
  onRetry,
}: {
  message: GateMessageKind
  onRetry: () => void
}) {
  const { accountId } = useAuth()
  let title: string
  let text: string
  switch (message.kind) {
    case 'accounts_error':
      title = 'Could not reach mmlabs Identity'
      text = 'Could not reach the server. Please try again.'
      break
    case 'network':
      title = 'Could not reach mmlabs Identity'
      text = 'Could not reach the server.'
      break
    case 'rate_limited':
      title = 'Too many requests'
      text = waitMessage(message.retryAfter)
      break
    case 'config':
      title = 'Configuration problem'
      text = 'The app is not configured correctly for mmlabs Identity.'
      break
    case 'rejected':
      title = 'Session not accepted'
      text = 'The admin API did not accept your session.'
      break
  }
  return (
    <AccessLayout>
      <StatusPanel title={title}>
        <p>{text}</p>
        {message.kind === 'config' && message.requestId && (
          <p className='text-muted-foreground'>
            Request ID: {message.requestId}
          </p>
        )}
        {message.kind !== 'config' && (
          <Button type='button' onClick={onRetry}>
            Retry
          </Button>
        )}
        {accountId && <SignOutButton scope='account' />}
      </StatusPanel>
    </AccessLayout>
  )
}
