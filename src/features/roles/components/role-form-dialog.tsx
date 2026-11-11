import { useMemo, useState } from 'react'
import { z } from 'zod'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SelectDropdown } from '@/components/select-dropdown'
import {
  createRole,
  updateRole,
  useAccessData,
} from '@/features/apps/data/access-store'
import { KEY_SEGMENT_PATTERN } from '@/features/apps/data/data'
import { type Role } from '@/features/apps/data/schema'

const roleFormSchema = z.object({
  app_id: z.string().min(1, 'App is required.'),
  // Part after the `<app>:` prefix
  key: z
    .string()
    .trim()
    .min(1, 'Key is required.')
    .regex(
      KEY_SEGMENT_PATTERN,
      'Key must start with a lowercase letter and use only lowercase letters, digits and hyphens.'
    ),
  name: z.string().trim().min(1, 'Name is required.'),
  permission_ids: z.array(z.string()),
})
type RoleForm = z.infer<typeof roleFormSchema>

type RoleFormDialogProps = {
  currentRow?: Role
  open: boolean
  onOpenChange: (open: boolean) => void
}

// admin:apps:write (planned name)
export function RoleFormDialog({
  currentRow,
  open,
  onOpenChange,
}: RoleFormDialogProps) {
  const isEdit = !!currentRow
  const { apps, roles, permissions, role_permissions } = useAccessData()
  const currentApp = apps.find((a) => a.id === currentRow?.app_id)
  const initialPermissionIds = useMemo(
    () =>
      currentRow
        ? role_permissions
            .filter((rp) => rp.role_id === currentRow.id)
            .map((rp) => rp.permission_id)
        : [],
    // Snapshot when the dialog mounts; later store changes must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentRow?.id]
  )

  const form = useForm<RoleForm>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      app_id: currentRow?.app_id ?? '',
      key:
        currentRow && currentApp
          ? currentRow.key.slice(currentApp.key.length + 1)
          : '',
      name: currentRow?.name ?? '',
      permission_ids: initialPermissionIds,
    },
  })
  const [pendingRemoval, setPendingRemoval] = useState<{
    values: RoleForm
    removedKeys: string[]
  } | null>(null)

  const appId = useWatch({ control: form.control, name: 'app_id' })
  const selectedApp = apps.find((a) => a.id === appId)
  const appPermissions = permissions.filter((p) => p.app_id === appId)

  const save = (values: RoleForm) => {
    if (currentRow) {
      updateRole(currentRow.id, {
        name: values.name,
        permission_ids: values.permission_ids,
      })
      toast.success(`Role ${currentRow.key} updated.`)
    } else {
      const key = `${selectedApp?.key}:${values.key}`
      createRole({
        app_id: values.app_id,
        key,
        name: values.name,
        permission_ids: values.permission_ids,
      })
      toast.success(`Role ${key} created.`)
    }
    setPendingRemoval(null)
    form.reset()
    onOpenChange(false)
  }

  const onSubmit = (values: RoleForm) => {
    if (!currentRow) {
      const fullKey = `${selectedApp?.key}:${values.key}`
      if (roles.some((r) => r.key === fullKey)) {
        form.setError('key', { message: `${fullKey} already exists.` })
        return
      }
      save(values)
      return
    }
    // Removing permissions from a role is access-changing: confirm first.
    const removedKeys = initialPermissionIds
      .filter((id) => !values.permission_ids.includes(id))
      .map((id) => permissions.find((p) => p.id === id)?.key ?? id)
    if (removedKeys.length) {
      setPendingRemoval({ values, removedKeys })
    } else {
      save(values)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(state) => {
          form.reset()
          onOpenChange(state)
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader className='text-start'>
            <DialogTitle>
              {isEdit ? `Edit role ${currentRow.key}` : 'New role'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update the role name and permissions. App and key cannot be changed.'
                : 'Create a role and choose its permissions.'}
            </DialogDescription>
          </DialogHeader>
          <div className='max-h-[60vh] overflow-y-auto px-0.5 py-1'>
            <Form {...form}>
              <form
                id='role-form'
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-4'
              >
                <FormField
                  control={form.control}
                  name='app_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>App</FormLabel>
                      <SelectDropdown
                        isControlled
                        disabled={isEdit}
                        defaultValue={field.value}
                        onValueChange={(value) => {
                          field.onChange(value)
                          form.setValue('permission_ids', [])
                        }}
                        placeholder='Select an app'
                        items={apps.map((a) => ({
                          label: `${a.name} (${a.key})`,
                          value: a.id,
                        }))}
                        className='w-full'
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='key'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key</FormLabel>
                      <div className='flex items-center gap-1'>
                        <span
                          className='font-mono text-sm text-muted-foreground'
                          aria-hidden
                        >
                          {(selectedApp?.key ?? '<app>') + ':'}
                        </span>
                        <FormControl>
                          <Input
                            placeholder='support'
                            autoComplete='off'
                            className='font-mono'
                            disabled={isEdit}
                            {...field}
                          />
                        </FormControl>
                      </div>
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
                          placeholder='Support'
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
                  name='permission_ids'
                  render={({ field }) => (
                    <FormItem>
                      <fieldset className='space-y-2'>
                        <legend className='text-sm font-medium'>
                          Permissions
                        </legend>
                        <FormDescription>
                          {selectedApp
                            ? `Only permissions of ${selectedApp.key} can be granted.`
                            : 'Select an app first.'}
                        </FormDescription>
                        <ul className='space-y-2'>
                          {appPermissions.map((permission) => (
                            <li
                              key={permission.id}
                              className='flex items-start gap-2'
                            >
                              <Checkbox
                                id={`perm-${permission.id}`}
                                checked={field.value.includes(permission.id)}
                                onCheckedChange={(checked) =>
                                  field.onChange(
                                    checked
                                      ? [...field.value, permission.id]
                                      : field.value.filter(
                                          (id) => id !== permission.id
                                        )
                                  )
                                }
                              />
                              <label
                                htmlFor={`perm-${permission.id}`}
                                className='text-sm leading-none'
                              >
                                <span className='font-mono'>
                                  {permission.key}
                                </span>
                                <span className='block text-muted-foreground'>
                                  {permission.description}
                                  {permission.is_admin && ' (admin only)'}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </fieldset>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
          <DialogFooter>
            <Button type='submit' form='role-form'>
              {isEdit ? 'Save changes' : 'Create role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingRemoval && currentRow && (
        <ConfirmDialog
          open
          onOpenChange={(state) => !state && setPendingRemoval(null)}
          destructive
          title={`Remove permissions from ${currentRow.key}?`}
          desc={
            <div className='space-y-2'>
              <p>
                Everyone with role {currentRow.key} will lose these permissions:
              </p>
              <ul className='list-disc ps-5 font-mono'>
                {pendingRemoval.removedKeys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </div>
          }
          confirmText='Remove and save'
          handleConfirm={() => save(pendingRemoval.values)}
        />
      )}
    </>
  )
}
