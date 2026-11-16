import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { Pencil, Trash2, Users } from 'lucide-react'
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
import { type Role } from '@/features/apps/data/schema'
import { useRoles } from './roles-provider'

export function RolesRowActions({ role }: { role: Role }) {
  const { setOpen, setCurrentId } = useRoles()
  const openDialog = (type: 'edit' | 'delete' | 'assignments') => {
    setCurrentId(role.id)
    setOpen(type)
  }

  return (
    <div className='flex items-center justify-end gap-1'>
      <Can action='roles.viewAssignments'>
        <Button
          variant='ghost'
          size='sm'
          className='h-8'
          aria-label={`Assignments of ${role.key}`}
          onClick={() => openDialog('assignments')}
        >
          <Users className='size-4' />
          Assignments
        </Button>
      </Can>
      <Can action={['roles.update', 'roles.delete']}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
            >
              <DotsHorizontalIcon className='h-4 w-4' />
              <span className='sr-only'>Open actions for {role.key}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-48'>
            <Can action='roles.update'>
              <DropdownMenuItem onClick={() => openDialog('edit')}>
                Edit
                <DropdownMenuShortcut>
                  <Pencil size={16} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </Can>
            <Can action='roles.delete'>
              <>
                <DropdownMenuSeparator />
                {/* System roles cannot be deleted */}
                <DropdownMenuItem
                  disabled={role.is_system}
                  onClick={() => openDialog('delete')}
                  className='text-red-500!'
                >
                  {role.is_system ? 'System role' : 'Delete'}
                  <DropdownMenuShortcut>
                    <Trash2 size={16} />
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              </>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      </Can>
    </div>
  )
}
