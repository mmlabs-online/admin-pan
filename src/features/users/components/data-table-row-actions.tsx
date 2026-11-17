import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { Eye, UserCheck, UserX } from 'lucide-react'
import { useSelfUserId } from '@/context/permission-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Can } from '@/components/permissions/can'
import { type User } from '../data/schema'
import { useUsers } from './users-provider'

type DataTableRowActionsProps = {
  row: Row<User>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow } = useUsers()
  const user = row.original
  const isActive = user.status === 'active'
  const selfId = useSelfUserId()
  const isSelf =
    selfId !== undefined && selfId.toLowerCase() === user.id.toLowerCase()
  return (
    <Can action={['users.view', 'users.setStatus']}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>
              Open actions for {user.email}
              {isSelf ? ' (your account)' : ''}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-40'>
          <Can action='users.view'>
            <DropdownMenuItem
              onClick={() => {
                setCurrentRow(user)
                setOpen('view')
              }}
            >
              View details
              <DropdownMenuShortcut>
                <Eye size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </Can>
          <Can action='users.setStatus'>
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isSelf}
                onClick={() => {
                  setCurrentRow(user)
                  setOpen('status')
                }}
                className={isActive ? 'text-red-500!' : undefined}
              >
                {isActive ? 'Disable' : 'Enable'}
                {isSelf && (
                  <span className='block text-xs text-muted-foreground'>
                    You can't change your own status
                  </span>
                )}
                <DropdownMenuShortcut>
                  {isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          </Can>
        </DropdownMenuContent>
      </DropdownMenu>
    </Can>
  )
}
