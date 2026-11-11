import { useMemo, useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  addPermission,
  setPermissionAdmin,
  useAccessData,
} from '../data/access-store'
import { KEY_SEGMENT_PATTERN } from '../data/data'
import { type App, type Permission } from '../data/schema'

const segment = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .regex(
      KEY_SEGMENT_PATTERN,
      `${label} must start with a lowercase letter and use only lowercase letters, digits and hyphens.`
    )

const permissionFormSchema = z.object({
  resource: segment('Resource'),
  action: segment('Action'),
  description: z.string().trim().min(1, 'Description is required.'),
  is_admin: z.boolean(),
})
type PermissionForm = z.infer<typeof permissionFormSchema>

export function AppPermissionsTab({ app }: { app: App }) {
  const { permissions, roles } = useAccessData()
  const appPermissions = useMemo(
    () => permissions.filter((p) => p.app_id === app.id),
    [permissions, app.id]
  )
  const defaultRole = roles.find((r) => r.id === app.default_role_id)
  const [adding, setAdding] = useState(false)
  const [pendingToggle, setPendingToggle] = useState<Permission | null>(null)

  return (
    <div className='space-y-4 pt-2'>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-sm text-muted-foreground'>
          {defaultRole
            ? `Non-admin permissions are granted to the default role ${defaultRole.key}.`
            : 'This app has no default role.'}
        </p>
        {!adding && (
          // admin:apps:write (planned name)
          <Button size='sm' onClick={() => setAdding(true)}>
            <Plus className='size-4' />
            Add permission
          </Button>
        )}
      </div>

      {adding && (
        <AddPermissionForm
          app={app}
          existingKeys={appPermissions.map((p) => p.key)}
          onDone={() => setAdding(false)}
        />
      )}

      <div className='overflow-hidden rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className='text-end'>Admin only</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appPermissions.length ? (
              appPermissions.map((permission) => (
                <TableRow key={permission.id}>
                  <TableCell className='font-mono text-sm'>
                    {permission.key}
                  </TableCell>
                  <TableCell className='whitespace-normal'>
                    {permission.description}
                  </TableCell>
                  <TableCell className='text-end'>
                    {/* admin:apps:write (planned name) */}
                    <Switch
                      checked={permission.is_admin}
                      aria-label={`Admin only: ${permission.key}`}
                      onCheckedChange={() => setPendingToggle(permission)}
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className='h-16 text-center'>
                  No permissions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pendingToggle && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingToggle(null)}
          destructive={!pendingToggle.is_admin}
          title={
            pendingToggle.is_admin
              ? `Allow ${pendingToggle.key} for members?`
              : `Make ${pendingToggle.key} admin only?`
          }
          desc={
            defaultRole
              ? pendingToggle.is_admin
                ? `${pendingToggle.key} will be granted to everyone with the default role ${defaultRole.key}.`
                : `${pendingToggle.key} will be removed from the default role ${defaultRole.key}. Only roles that list it explicitly keep it.`
              : `${pendingToggle.key} will be marked as ${pendingToggle.is_admin ? 'not admin only' : 'admin only'}.`
          }
          confirmText={
            pendingToggle.is_admin ? 'Allow for members' : 'Make admin only'
          }
          handleConfirm={() => {
            setPermissionAdmin(pendingToggle.id, !pendingToggle.is_admin)
            toast.success(
              `${pendingToggle.key} is now ${pendingToggle.is_admin ? 'available to members' : 'admin only'}.`
            )
            setPendingToggle(null)
          }}
        />
      )}
    </div>
  )
}

type AddPermissionFormProps = {
  app: App
  existingKeys: string[]
  onDone: () => void
}

// admin:apps:write (planned name)
function AddPermissionForm({
  app,
  existingKeys,
  onDone,
}: AddPermissionFormProps) {
  const form = useForm<PermissionForm>({
    resolver: zodResolver(permissionFormSchema),
    defaultValues: {
      resource: '',
      action: '',
      description: '',
      is_admin: false,
    },
  })
  const resource = useWatch({ control: form.control, name: 'resource' })
  const action = useWatch({ control: form.control, name: 'action' })

  const onSubmit = (values: PermissionForm) => {
    const key = `${app.key}:${values.resource}:${values.action}`
    if (existingKeys.includes(key)) {
      form.setError('action', { message: `${key} already exists.` })
      return
    }
    addPermission(app.id, {
      key,
      description: values.description,
      is_admin: values.is_admin,
    })
    toast.success(`Permission ${key} added.`)
    onDone()
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className='space-y-3 rounded-md border p-4'
        aria-label='Add permission'
      >
        <div className='grid gap-3 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='resource'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resource</FormLabel>
                <FormControl>
                  <Input placeholder='orders' autoComplete='off' {...field} />
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
              <FormLabel>Description</FormLabel>
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
            <FormItem className='flex items-center gap-2'>
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              </FormControl>
              <FormLabel className='font-normal'>
                Admin only (not granted to the default role)
              </FormLabel>
            </FormItem>
          )}
        />
        <div className='flex justify-end gap-2'>
          <Button type='button' variant='outline' onClick={onDone}>
            Cancel
          </Button>
          <Button type='submit'>Save permission</Button>
        </div>
      </form>
    </Form>
  )
}
