import { useMemo, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SelectDropdown } from '@/components/select-dropdown'
import {
  assignRole,
  revokeAssignment,
  useAccessData,
} from '@/features/apps/data/access-store'
import { formatDate } from '@/features/apps/data/data'
import { type Role } from '@/features/apps/data/schema'

const APP_SCOPE = 'app'

type AssignmentRow = {
  id: string
  email: string
  scope: string
  expires_at: string | null
}

type RoleAssignmentsSheetProps = {
  role: Role
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleAssignmentsSheet({
  role,
  open,
  onOpenChange,
}: RoleAssignmentsSheetProps) {
  const { apps, role_assignments, users, orgs } = useAccessData()
  const app = apps.find((a) => a.id === role.app_id)
  const [assigning, setAssigning] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<AssignmentRow | null>(null)

  const rows = useMemo<AssignmentRow[]>(
    () =>
      role_assignments
        .filter((ra) => ra.role_id === role.id)
        .map((ra) => ({
          id: ra.id,
          email: users.find((u) => u.id === ra.user_id)?.email ?? ra.user_id,
          scope: ra.org_id
            ? (orgs.find((o) => o.id === ra.org_id)?.name ?? ra.org_id)
            : `App (${app?.key ?? '—'})`,
          expires_at: ra.expires_at,
        })),
    [role_assignments, role.id, users, orgs, app?.key]
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>
            Assignments of <span className='font-mono'>{role.key}</span>
          </SheetTitle>
          <SheetDescription>
            Users who hold {role.name}, app-wide or in one organization.
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 space-y-4 overflow-y-auto px-4 pb-4'>
          {!assigning && (
            // admin:roles:assign (planned name)
            <Button size='sm' onClick={() => setAssigning(true)}>
              <UserPlus className='size-4' />
              Assign role
            </Button>
          )}
          {assigning && (
            <AssignRoleForm role={role} onDone={() => setAssigning(false)} />
          )}
          <div className='overflow-hidden rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>
                    <span className='sr-only'>Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.scope}</TableCell>
                      <TableCell>
                        {row.expires_at ? formatDate(row.expires_at) : 'Never'}
                      </TableCell>
                      <TableCell className='text-end'>
                        {/* admin:roles:assign (planned name) */}
                        <Button
                          variant='ghost'
                          size='sm'
                          className='text-red-600'
                          aria-label={`Revoke ${role.key} from ${row.email} (${row.scope})`}
                          onClick={() => setPendingRevoke(row)}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className='h-16 text-center'>
                      No one has this role yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {pendingRevoke && (
          <ConfirmDialog
            open
            onOpenChange={(state) => !state && setPendingRevoke(null)}
            destructive
            title={`Revoke ${role.key} from ${pendingRevoke.email}?`}
            desc={`${pendingRevoke.email} loses role ${role.key} (scope: ${pendingRevoke.scope}).`}
            confirmText='Revoke'
            handleConfirm={() => {
              revokeAssignment(pendingRevoke.id)
              toast.success(`Revoked ${role.key} from ${pendingRevoke.email}.`)
              setPendingRevoke(null)
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

const assignFormSchema = z.object({
  email: z.email({
    error: (iss) =>
      iss.input === '' ? 'Email is required.' : 'Enter a valid email.',
  }),
  org_id: z.string(),
  // yyyy-mm-dd from a date input, or empty for no expiry
  expires_on: z
    .string()
    .refine(
      (v) => v === '' || new Date(`${v}T00:00:00Z`).getTime() > Date.now(),
      'Expiry date must be in the future.'
    ),
})
type AssignForm = z.infer<typeof assignFormSchema>

// admin:roles:assign (planned name)
function AssignRoleForm({ role, onDone }: { role: Role; onDone: () => void }) {
  const { users, orgs, role_assignments } = useAccessData()
  const form = useForm<AssignForm>({
    resolver: zodResolver(assignFormSchema),
    defaultValues: { email: '', org_id: APP_SCOPE, expires_on: '' },
  })

  const onSubmit = (values: AssignForm) => {
    const email = values.email.trim().toLowerCase()
    // The API resolves the user; the mock only knows a few accounts.
    const user = users.find((u) => u.email === email)
    if (!user) {
      form.setError('email', { message: 'No user with this email.' })
      return
    }
    const org_id = values.org_id === APP_SCOPE ? null : values.org_id
    if (
      role_assignments.some(
        (ra) =>
          ra.role_id === role.id &&
          ra.user_id === user.id &&
          ra.org_id === org_id
      )
    ) {
      form.setError('email', {
        message: 'This user already has the role in this scope.',
      })
      return
    }
    assignRole({
      role_id: role.id,
      user_id: user.id,
      org_id,
      expires_at: values.expires_on
        ? new Date(`${values.expires_on}T00:00:00Z`).toISOString()
        : null,
    })
    toast.success(`Assigned ${role.key} to ${email}.`)
    onDone()
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className='space-y-3 rounded-md border p-4'
        aria-label='Assign role'
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>User email</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  placeholder='name@example.com'
                  autoComplete='off'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className='grid gap-3 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='org_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Organization</FormLabel>
                <SelectDropdown
                  isControlled
                  defaultValue={field.value}
                  onValueChange={field.onChange}
                  items={[
                    { label: 'None (app-wide)', value: APP_SCOPE },
                    ...orgs.map((o) => ({ label: o.name, value: o.id })),
                  ]}
                  className='w-full'
                />
                <FormDescription>Optional: limit to one org.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='expires_on'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expires on</FormLabel>
                <FormControl>
                  <Input type='date' {...field} />
                </FormControl>
                <FormDescription>Optional.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className='flex justify-end gap-2'>
          <Button type='button' variant='outline' onClick={onDone}>
            Cancel
          </Button>
          <Button type='submit'>Assign</Button>
        </div>
      </form>
    </Form>
  )
}
