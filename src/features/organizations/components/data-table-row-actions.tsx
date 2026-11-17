import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { Ban, CircleCheck, Eye, Pencil, Trash2 } from 'lucide-react'
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
import { type Organization } from '../data/schema'
import { useOrganizations } from './organizations-provider'

type DataTableRowActionsProps = {
  row: Row<Organization>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow, viewButtons } = useOrganizations()
  const org = row.original
  const isSuspended = org.status === 'suspended'

  return (
    <div className='flex items-center justify-end gap-1'>
      <Can action='organizations.view'>
        <Button
          variant='ghost'
          size='sm'
          className='h-8'
          aria-label={`View ${org.name}`}
          ref={(el) => {
            if (el) viewButtons.current.set(org.id, el)
            else viewButtons.current.delete(org.id)
          }}
          onClick={() => {
            setCurrentRow(org)
            setOpen('view')
          }}
        >
          <Eye className='size-4' aria-hidden='true' />
          View
        </Button>
      </Can>
      <Can action={['organizations.update', 'organizations.delete']}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
              aria-label={`Actions for ${org.name}`}
            >
              <DotsHorizontalIcon className='h-4 w-4' aria-hidden='true' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-44'>
            <Can action='organizations.update'>
              <>
                <DropdownMenuItem
                  onClick={() => {
                    setCurrentRow(org)
                    setOpen('edit')
                  }}
                >
                  Edit
                  <DropdownMenuShortcut>
                    <Pencil size={16} aria-hidden='true' />
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setCurrentRow(org)
                    setOpen('status')
                  }}
                >
                  {isSuspended ? 'Reactivate' : 'Suspend'}
                  <DropdownMenuShortcut>
                    {isSuspended ? (
                      <CircleCheck size={16} aria-hidden='true' />
                    ) : (
                      <Ban size={16} aria-hidden='true' />
                    )}
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              </>
            </Can>
            <Can action='organizations.delete'>
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setCurrentRow(org)
                    setOpen('delete')
                  }}
                  className='text-red-500!'
                >
                  Delete
                  <DropdownMenuShortcut>
                    <Trash2 size={16} aria-hidden='true' />
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
