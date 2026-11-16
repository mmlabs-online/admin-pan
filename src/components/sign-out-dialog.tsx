import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@mmlabs/auth-client/react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** One account (the current one) or every account on this browser. */
  scope?: 'account' | 'all'
}

export function SignOutDialog({
  open,
  onOpenChange,
  scope = 'account',
}: SignOutDialogProps) {
  const navigate = useNavigate()
  const { accounts, accountId, logout } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const email = accounts.find((a) => a.accountId === accountId)?.email

  async function handleSignOut() {
    setIsLoading(true)
    // Leave the current page first: an explicit sign-out never carries it as `redirect`.
    await navigate({ to: '/', replace: true })
    try {
      await logout(scope === 'all' ? { all: true } : { accountId: accountId! })
    } catch {
      // The library has already cleared local state; the server call failed.
      toast.error(
        'Could not reach the server. You are signed out here, but the session may still be active; sign out again later.'
      )
    } finally {
      setIsLoading(false)
      onOpenChange(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={scope === 'all' ? 'Sign out of all accounts' : 'Sign out'}
      desc={
        scope === 'all'
          ? `Sign out all ${accounts.length} accounts on this browser, in every mmlabs app?`
          : `Sign out ${email ?? 'this account'} on this browser? Other mmlabs apps open in this browser are signed out of this account too.`
      }
      confirmText={scope === 'all' ? 'Sign out all' : 'Sign out'}
      destructive
      isLoading={isLoading}
      handleConfirm={() => void handleSignOut()}
      className='sm:max-w-sm'
    />
  )
}
