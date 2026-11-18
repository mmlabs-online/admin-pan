import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { KeyRound, Pencil, Star, Trash2, Users } from 'lucide-react'
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
import { ADMIN_APP_KEY } from '@/features/apps/data/app-schema'
import { type RoleDefinition } from '../data/role-schema'
import { useRoles } from './roles-provider'

const Reason = ({ children }: { children: React.ReactNode }) => (
  <span className='block text-xs font-normal text-muted-foreground'>
    {children}
  </span>
)

export function RolesRowActions({ role }: { role: RoleDefinition }) {
  const { app, setOpen, setCurrentRow } = useRoles()
  const openDialog = (
    type: 'rename' | 'permissions' | 'delete' | 'default' | 'holders'
  ) => {
    setCurrentRow(role)
    setOpen(type)
  }
  const isOwner = app?.org_owner_role_id === role.id
  const noDefault = app?.key === ADMIN_APP_KEY
  // Advisory hints only: the API's 409 is always handled.
  const deleteReason = role.is_system
    ? "System roles can't be deleted"
    : role.is_default
      ? 'Default role: choose another default first'
      : isOwner
        ? 'Org owner role'
        : null

  return (
    <div className='flex items-center justify-end gap-1'>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
            aria-label={`Actions for ${role.key}`}
          >
            <DotsHorizontalIcon className='h-4 w-4' aria-hidden='true' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-56'>
          <DropdownMenuItem onClick={() => openDialog('permissions')}>
            Permissions
            <DropdownMenuShortcut>
              <KeyRound size={16} aria-hidden='true' />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <Can action='roles.viewHolders'>
            <DropdownMenuItem onClick={() => openDialog('holders')}>
              Assignments
              <DropdownMenuShortcut>
                <Users size={16} aria-hidden='true' />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </Can>
          <Can action='roles.rename'>
            <DropdownMenuItem onClick={() => openDialog('rename')}>
              Rename
              <DropdownMenuShortcut>
                <Pencil size={16} aria-hidden='true' />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </Can>
          {!role.is_default && (
            <Can action='roles.setDefault'>
              <DropdownMenuItem
                disabled={noDefault}
                onClick={() => openDialog('default')}
              >
                <span>
                  Set as default
                  {noDefault && (
                    <Reason>The admin app has no default role</Reason>
                  )}
                </span>
                <DropdownMenuShortcut>
                  <Star size={16} aria-hidden='true' />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </Can>
          )}
          <Can action='roles.delete'>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={deleteReason !== null}
              onClick={() => openDialog('delete')}
              className='text-red-700 dark:text-red-400'
            >
              <span>
                Delete
                {deleteReason && <Reason>{deleteReason}</Reason>}
              </span>
              <DropdownMenuShortcut>
                <Trash2 size={16} aria-hidden='true' />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </Can>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
