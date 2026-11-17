import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { Ban, CircleCheck, Eye, Pencil } from 'lucide-react'
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
import { type App } from '../data/app-schema'
import { useApps } from './apps-provider'

export function AppsRowActions({ app }: { app: App }) {
  const { setOpen, setCurrentRow } = useApps()
  const openDialog = (type: 'view' | 'edit' | 'status') => {
    setCurrentRow(app)
    setOpen(type)
  }
  const active = app.status === 'active'

  return (
    <div className='flex items-center justify-end gap-1'>
      <Can action='apps.view'>
        <Button
          variant='ghost'
          size='sm'
          className='h-8'
          aria-label={`View ${app.key}`}
          onClick={() => openDialog('view')}
        >
          <Eye className='size-4' aria-hidden='true' />
          View
        </Button>
      </Can>
      <Can action='apps.update'>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
              aria-label={`Actions for ${app.key}`}
            >
              <DotsHorizontalIcon className='h-4 w-4' aria-hidden='true' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-40'>
            <DropdownMenuItem onClick={() => openDialog('edit')}>
              Edit
              <DropdownMenuShortcut>
                <Pencil size={16} aria-hidden='true' />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => openDialog('status')}
              className={active ? 'text-red-700 dark:text-red-400' : undefined}
            >
              {active ? 'Disable' : 'Enable'}
              <DropdownMenuShortcut>
                {active ? (
                  <Ban size={16} aria-hidden='true' />
                ) : (
                  <CircleCheck size={16} aria-hidden='true' />
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Can>
    </div>
  )
}
