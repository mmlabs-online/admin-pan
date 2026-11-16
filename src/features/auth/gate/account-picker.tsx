import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '@mmlabs/auth-client/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { useReturnTo } from './use-return-to'

/** "Continue as …" buttons for the device's accounts (the account picker / switch). */
export function AccountList({ exclude }: { exclude?: string }) {
  const { accounts, selectAccount } = useAuth()
  const items = accounts.filter((a) => a.accountId !== exclude)
  if (items.length === 0) return null
  return (
    <ul className='grid gap-2'>
      {items.map((a) => (
        <li key={a.accountId}>
          <Button
            type='button'
            variant='outline'
            className='h-auto w-full justify-start py-2 whitespace-normal'
            onClick={() => selectAccount(a.accountId)}
          >
            <span className='grid text-start'>
              <span>Continue as {a.displayName ?? a.email}</span>
              {a.displayName && (
                <span className='text-xs text-muted-foreground'>{a.email}</span>
              )}
            </span>
            {!a.emailVerified && (
              <Badge variant='secondary'>Email not verified</Badge>
            )}
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function UseAnotherAccount() {
  const redirect = useReturnTo()
  return (
    <Link
      to='/sign-in'
      search={redirect ? { redirect } : {}}
      className='text-sm underline underline-offset-4 hover:text-primary'
    >
      Use another account
    </Link>
  )
}

export function SignOutButton({ scope }: { scope: 'account' | 'all' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type='button' variant='outline' onClick={() => setOpen(true)}>
        {scope === 'all' ? 'Sign out of all accounts' : 'Sign out'}
      </Button>
      <SignOutDialog open={open} onOpenChange={setOpen} scope={scope} />
    </>
  )
}
