import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useCreatePermissionMutation } from '../api/queries'
import {
  ADMIN_APP_KEY,
  type App,
  type PermissionForm,
  permissionFormSchema,
} from '../data/app-schema'
import { permissionFormError, type AppAlert } from '../data/errors'
import { useApps } from './apps-provider'

type AppPermissionFormDialogProps = {
  app: App
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Radix returns focus only to a `Trigger`; the opener returns it by hand. */
  returnFocus: () => void
}

// POST /api/v1/apps/{key}/permissions — admin:roles:manage (the API adds
// admin:* for admin-only permissions and for the admin app). `scope` is never
// sent: the API default applies. Never optimistic (R9).
export function AppPermissionFormDialog({
  app,
  open,
  onOpenChange,
  returnFocus,
}: AppPermissionFormDialogProps) {
  const { api } = useApps()
  const create = useCreatePermissionMutation(app.key, api)
  const pending = create.isPending
  const inFlight = useRef(false)
  const [alert, setAlert] = useState<AppAlert | null>(null)
  const isAdminApp = app.key === ADMIN_APP_KEY

  const form = useForm<PermissionForm>({
    resolver: zodResolver(permissionFormSchema),
    defaultValues: {
      resource: '',
      action: '',
      description: '',
      is_admin: isAdminApp,
    },
  })
  const resource = useWatch({ control: form.control, name: 'resource' })
  const action = useWatch({ control: form.control, name: 'action' })

  const reset = () => {
    form.reset()
    create.reset()
    setAlert(null)
  }

  const onSubmit = async (values: PermissionForm) => {
    if (inFlight.current) return
    inFlight.current = true
    setAlert(null)
    const key = `${app.key}:${values.resource}:${values.action}`
    try {
      await create.mutateAsync({
        key,
        is_admin: isAdminApp || values.is_admin,
        ...(values.description ? { description: values.description } : {}),
      })
    } catch (error) {
      const mapped = permissionFormError(error)
      const [first, ...rest] = Object.entries(mapped.fields) as [
        'resource' | 'action' | 'description',
        string,
      ][]
      if (first)
        form.setError(first[0], { message: first[1] }, { shouldFocus: true })
      for (const [field, message] of rest) form.setError(field, { message })
      setAlert(mapped.alert)
      return
    } finally {
      inFlight.current = false
    }
    toast.success(`Permission ${key} added.`)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state && pending) return
        reset()
        onOpenChange(state)
      }}
    >
      <DialogContent
        className='sm:max-w-lg'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        <DialogHeader className='text-start'>
          <DialogTitle>Add permission</DialogTitle>
          <DialogDescription>
            Add a permission to {app.name} ({app.key}).
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='permission-form'
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className='space-y-3'
            noValidate
          >
            <div className='grid gap-3 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='resource'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resource</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='orders'
                        autoComplete='off'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='action'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Action</FormLabel>
                    <FormControl>
                      <Input placeholder='read' autoComplete='off' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className='text-sm text-muted-foreground'>
              Key:{' '}
              <span className='font-mono'>
                {app.key}:{resource || '<resource>'}:{action || '<action>'}
              </span>
            </p>
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='View orders'
                      autoComplete='off'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='is_admin'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center gap-2'>
                    <FormControl>
                      <Checkbox
                        checked={isAdminApp || field.value}
                        disabled={isAdminApp}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    </FormControl>
                    <FormLabel className='font-normal'>Admin only</FormLabel>
                  </div>
                  <FormDescription>
                    {isAdminApp
                      ? 'Admin app permissions are always admin only. Adding one needs admin:*.'
                      : 'Admin-only permissions need admin:* to create.'}
                  </FormDescription>
                </FormItem>
              )}
            />
          </form>
        </Form>
        {alert?.kind === 'forbidden' && (
          <ForbiddenPanel variant='inline' copy={alert.copy} />
        )}
        {alert?.kind === 'message' && (
          <p role='alert' className='text-sm text-destructive'>
            {alert.text}
          </p>
        )}
        <p role='status' aria-live='polite' className='sr-only'>
          {pending ? 'Adding…' : ''}
        </p>
        <DialogFooter>
          <Button
            type='submit'
            form='permission-form'
            aria-disabled={pending || undefined}
            className={pending ? 'opacity-50' : undefined}
          >
            {pending ? 'Adding…' : 'Add permission'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
