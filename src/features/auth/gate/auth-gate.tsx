import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@mmlabs/auth-client/react'
import { StatusPanel } from '../components/status-panel'
import {
  AccessLayout,
  BootSpinner,
  EmailUnverifiedPage,
  GateMessage,
  NotMemberPage,
} from './access-pages'
import { AccountList, SignOutButton, UseAnotherAccount } from './account-picker'
import { useAccessCheck } from './use-access-check'
import { useReturnTo } from './use-return-to'

/** The auth guard of every `_authenticated` route (R3). Children render only after the token check. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, accountId, reload } = useAuth()
  switch (status) {
    case 'loading':
      return <BootSpinner />
    case 'signed-out':
      return <RedirectToSignIn />
    case 'needs-account':
      return (
        <AccessLayout>
          <StatusPanel title='Choose an account'>
            <AccountList />
            <UseAnotherAccount />
            <SignOutButton scope='all' />
          </StatusPanel>
        </AccessLayout>
      )
    case 'error':
      return (
        <GateMessage
          message={{ kind: 'accounts_error' }}
          onRetry={() => void reload()}
        />
      )
    case 'ready':
      return <ReadyGate accountId={accountId!}>{children}</ReadyGate>
  }
}

// Not <Navigate>: it navigates again on every render, which cancels its own transition.
function RedirectToSignIn() {
  const navigate = useNavigate()
  // frozen: the location changes to /sign-in while this is still mounted
  const [returnTo] = useState(useReturnTo())
  useEffect(() => {
    void navigate({
      to: '/sign-in',
      search: returnTo ? { redirect: returnTo } : {},
      replace: true,
    })
  }, [navigate, returnTo])
  return <BootSpinner />
}

function ReadyGate({
  accountId,
  children,
}: {
  accountId: string
  children: React.ReactNode
}) {
  const { state, recheck } = useAccessCheck(accountId)

  switch (state.kind) {
    case 'checking':
      return <BootSpinner />
    case 'ok':
      return children
    case 'not_member':
      return <NotMemberPage />
    case 'email_unverified':
      return <EmailUnverifiedPage onContinue={() => recheck(true)} />
    default:
      return <GateMessage message={state} onRetry={() => void recheck(true)} />
  }
}
