import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAuth } from '@mmlabs/auth-client/react'
import { BadgeCheck, ChevronsUpDown, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { SignOutDialog } from '@/components/sign-out-dialog'

export function NavUser() {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const { accounts, accountId, selectAccount } = useAuth()
  const [signOut, setSignOut] = useState<'account' | 'all' | null>(null)
  const current = accounts.find((a) => a.accountId === accountId)
  const label = current?.displayName ?? current?.email ?? ''
  const initials = label.slice(0, 2).toUpperCase()

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size='lg'
                className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              >
                <Avatar className='h-8 w-8 rounded-lg'>
                  <AvatarFallback className='rounded-lg'>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>{label}</span>
                  <span className='truncate text-xs'>{current?.email}</span>
                </div>
                <ChevronsUpDown className='ms-auto size-4' />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
              side={isMobile ? 'bottom' : 'right'}
              align='end'
              sideOffset={4}
            >
              <DropdownMenuLabel className='font-normal'>
                <div className='grid text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>{label}</span>
                  <span className='truncate text-xs'>{current?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {accounts
                  .filter((a) => a.accountId !== accountId)
                  .map((a) => (
                    <DropdownMenuItem
                      key={a.accountId}
                      onClick={() => {
                        selectAccount(a.accountId)
                        void navigate({ to: '/' })
                      }}
                    >
                      Switch to {a.displayName ?? a.email}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuItem asChild>
                  <Link to='/sign-in'>Use another account</Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link to='/settings/account'>
                    <BadgeCheck />
                    Settings
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setSignOut('account')}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setSignOut('all')}
              >
                <LogOut />
                Sign out of all accounts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SignOutDialog
        open={signOut !== null}
        onOpenChange={(o) => !o && setSignOut(null)}
        scope={signOut ?? 'account'}
      />
    </>
  )
}
