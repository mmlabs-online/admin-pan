import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ADMIN_APP_KEY, type App } from '@/features/apps/data/app-schema'
import { type AppAlert } from '@/features/apps/data/errors'
import { useRenameRoleMutation } from '../api/queries'
import { roleRenameError } from '../data/errors'
import {
  roleRenameSchema,
  type RoleDefinition,
  type RoleRenameForm,
} from '../data/role-schema'
import { RoleAlertView } from './role-alert-view'
import { useRoles } from './roles-provider'

type RoleRenameDialogProps = {
  app: App
  currentRow: RoleDefinition
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: () => void
}

// PATCH /api/v1/apps/{key}/roles/{role_id} { name } — admin:roles:manage
// (+ admin:* for the admin app; the API decides). An unchanged name sends
// nothing. Never optimistic (R9).
export function RoleRenameDialog({
  app,
  currentRow,
  open,
  onOpenChange,
  returnFocus,
}: RoleRenameDialogProps) {
  const { api } = useRoles()
  const rename = useRenameRoleMutation(app.key, api)
  const inFlight = useRef(false)
  const [alert, setAlert] = useState<AppAlert | null>(null)
  const form = useForm<RoleRenameForm>({
    resolver: zodResolver(roleRenameSchema),
    defaultValues: { name: currentRow.name },
  })

  const reset = () => {
    form.reset({ name: currentRow.name })
    rename.reset()
    setAlert(null)
  }

  const onSubmit = async (values: RoleRenameForm) => {
    if (inFlight.current) return
    if (values.name === currentRow.name) {
      onOpenChange(false)
      return
    }
    inFlight.current = true
    setAlert(null)
    try {
      await rename.mutateAsync({ roleId: currentRow.id, name: values.name })
    } catch (error) {
      const mapped = roleRenameError(error)
      if (mapped.fields.name)
        form.setError(
          'name',
          { message: mapped.fields.name },
          { shouldFocus: true }
        )
      setAlert(mapped.alert)
      return
    } finally {
      inFlight.current = false
    }
    toast.success(`Role ${currentRow.key} renamed.`)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state && rename.isPending) return
        reset()
        onOpenChange(state)
      }}
    >
      <DialogContent
        className='sm:max-w-md'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        <DialogHeader className='text-start'>
          <DialogTitle>Rename role</DialogTitle>
          <DialogDescription>
            Change the display name of{' '}
            <span className='font-mono'>{currentRow.key}</span>. The key can
            never change.
          </DialogDescription>
        </DialogHeader>
        {app.key === ADMIN_APP_KEY && (
          <p className='text-sm text-muted-foreground'>
            Changes to the admin app&apos;s roles need the admin:* permission.
          </p>
        )}
        <Form {...form}>
          <form
            id='role-rename-form'
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            noValidate
          >
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete='off' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <RoleAlertView alert={alert} />
        <p role='status' aria-live='polite' className='sr-only'>
          {rename.isPending ? 'Saving…' : ''}
        </p>
        <DialogFooter>
          <Button
            type='submit'
            form='role-rename-form'
            aria-disabled={rename.isPending || undefined}
            className={rename.isPending ? 'opacity-50' : undefined}
          >
            {rename.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
