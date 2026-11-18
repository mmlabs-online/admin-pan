import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ADMIN_APP_KEY, type App } from '@/features/apps/data/app-schema'
import { isUnknownOutcome, type AppAlert } from '@/features/apps/data/errors'
import {
  appAllPermissionsQueryOptions,
  useCreateRoleMutation,
  useReplaceRolePermissionsMutation,
} from '../api/queries'
import { roleCreateError, rolePermissionsError } from '../data/errors'
import {
  PERMISSION_KEYS_MAX,
  roleCreateSchema,
  type Role,
  type RoleCreateForm,
} from '../data/role-schema'
import { RoleAlertView } from './role-alert-view'
import { RolePermissionPicker } from './role-permission-picker'
import { useRoles } from './roles-provider'

type RoleCreateDialogProps = {
  app: App
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Radix returns focus only to a `Trigger`; the opener returns it by hand. */
  returnFocus: () => void
}

// Two steps: POST /roles (key, name), then PUT /roles/{id}/permissions with the
// id from the POST response. If the PUT fails the role exists: the dialog moves
// to a "partial" phase that offers only the PUT again, never the POST (R9).
export function RoleCreateDialog({
  app,
  open,
  onOpenChange,
  returnFocus,
}: RoleCreateDialogProps) {
  const { api } = useRoles()
  const create = useCreateRoleMutation(app.key, api)
  const replace = useReplaceRolePermissionsMutation(app.key, api)
  const permissions = useQuery({
    ...appAllPermissionsQueryOptions(app.key, api),
    enabled: open,
  })
  const pending = create.isPending || replace.isPending
  const inFlight = useRef(false)
  const createdRef = useRef<Role | null>(null)
  const afterUnknown = useRef(false)
  const alertBox = useRef<HTMLDivElement>(null)
  const [created, setCreated] = useState<Role | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [alert, setAlert] = useState<AppAlert | null>(null)
  const partial = created !== null
  const isAdminApp = app.key === ADMIN_APP_KEY
  const overLimit = selected.size > PERMISSION_KEYS_MAX

  const form = useForm<RoleCreateForm>({
    resolver: zodResolver(roleCreateSchema),
    defaultValues: { segment: '', name: '' },
  })

  useEffect(() => {
    if (partial && alert) alertBox.current?.focus()
  }, [partial, alert])

  const reset = () => {
    form.reset()
    create.reset()
    replace.reset()
    setAlert(null)
    setSelected(new Set())
    setCreated(null)
    createdRef.current = null
    afterUnknown.current = false
  }

  const savePermissions = async (role: Role) => {
    const keys = [...selected].sort()
    if (!keys.length) {
      toast.success(`Role ${role.key} created.`)
      reset()
      onOpenChange(false)
      return
    }
    try {
      await replace.mutateAsync({ roleId: role.id, keys })
    } catch (error) {
      setAlert(rolePermissionsError(error))
      return
    }
    toast.success(`Role ${role.key} created with ${keys.length} permissions.`)
    reset()
    onOpenChange(false)
  }

  const onSubmit = async (values: RoleCreateForm) => {
    if (inFlight.current || overLimit) return
    inFlight.current = true
    setAlert(null)
    try {
      if (!createdRef.current) {
        try {
          createdRef.current = await create.mutateAsync({
            key: `${app.key}:${values.segment}`,
            name: values.name,
          })
        } catch (error) {
          const mapped = roleCreateError(error, {
            appKey: app.key,
            afterUnknown: afterUnknown.current,
          })
          afterUnknown.current = isUnknownOutcome(error)
          const [first, ...rest] = Object.entries(mapped.fields) as [
            'segment' | 'name',
            string,
          ][]
          if (first)
            form.setError(
              first[0],
              { message: first[1] },
              { shouldFocus: true }
            )
          for (const [field, text] of rest)
            form.setError(field, { message: text })
          setAlert(mapped.alert)
          return
        }
        setCreated(createdRef.current)
      }
      await savePermissions(createdRef.current)
    } finally {
      inFlight.current = false
    }
  }

  const retry = async () => {
    if (inFlight.current || overLimit || !createdRef.current) return
    inFlight.current = true
    setAlert(null)
    try {
      await savePermissions(createdRef.current)
    } finally {
      inFlight.current = false
    }
  }

  const label = pending
    ? create.isPending
      ? 'Creating…'
      : 'Saving permissions…'
    : null

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
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            Create a role in {app.name} ({app.key}), then choose its
            permissions.
          </DialogDescription>
        </DialogHeader>
        {isAdminApp && (
          <p className='text-sm text-muted-foreground'>
            Changes to the admin app&apos;s roles need the admin:* permission.
          </p>
        )}
        {partial && (
          <div
            ref={alertBox}
            tabIndex={-1}
            role='alert'
            className='space-y-1 rounded-md border border-destructive p-3 text-sm'
          >
            <p className='font-medium'>
              Role {created.key} was created, but its permissions weren&apos;t
              saved.
            </p>
            {alert?.kind === 'message' && <p>{alert.text}</p>}
            {alert?.kind === 'forbidden' && (
              <>
                <p>{alert.copy.title}</p>
                <p className='text-muted-foreground'>
                  {alert.copy.description}
                </p>
              </>
            )}
          </div>
        )}
        <Form {...form}>
          <form
            id='role-create-form'
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className='space-y-3'
            noValidate
          >
            <FormField
              control={form.control}
              name='segment'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key</FormLabel>
                  <div className='flex items-center gap-1'>
                    <span className='font-mono text-sm'>{app.key}:</span>
                    <FormControl>
                      <Input
                        placeholder='viewer'
                        autoComplete='off'
                        readOnly={partial}
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <FormDescription>
                    The key starts with {app.key}: and can&apos;t be changed
                    later.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Viewer'
                      autoComplete='off'
                      readOnly={partial}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        {permissions.isError ? (
          <div role='alert' className='space-y-2 text-sm'>
            <p>Couldn&apos;t load the permission list.</p>
            <Button
              size='sm'
              type='button'
              onClick={() => void permissions.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : permissions.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading permissions…
          </p>
        ) : (
          <RolePermissionPicker
            appKey={app.key}
            permissions={permissions.data}
            selected={selected}
            onChange={setSelected}
            disabled={pending}
          />
        )}
        {!partial && <RoleAlertView alert={alert} />}
        <p role='status' aria-live='polite' className='sr-only'>
          {label ?? ''}
        </p>
        <DialogFooter>
          {partial ? (
            <>
              <Button
                type='button'
                variant='outline'
                aria-disabled={pending || undefined}
                onClick={() => {
                  if (pending) return
                  reset()
                  onOpenChange(false)
                }}
              >
                Close
              </Button>
              <Button
                type='button'
                aria-disabled={pending || overLimit || undefined}
                className={pending ? 'opacity-50' : undefined}
                onClick={() => void retry()}
              >
                {label ?? 'Retry saving permissions'}
              </Button>
            </>
          ) : (
            <Button
              type='submit'
              form='role-create-form'
              aria-disabled={pending || overLimit || undefined}
              className={pending ? 'opacity-50' : undefined}
            >
              {label ?? 'Create role'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
