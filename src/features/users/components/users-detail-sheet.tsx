import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatDateTime, userLabel } from '../data/data'
import { type User } from '../data/schema'
import { UserStatusBadge } from './user-status-badge'

type UsersDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
}

// Preview only — role assignments arrive with org-admin-api USR-02.
const PREVIEW_APP_ROLES = [
  { app: 'stoktok', role: 'member' },
  { app: 'admin', role: 'viewer' },
]

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className='grid grid-cols-3 gap-2 py-1.5'>
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='col-span-2 text-sm break-all'>{children}</dd>
    </div>
  )
}

/** User details — `GET /api/v1/users/{id}` (admin:users:read). */
export function UsersDetailSheet({
  open,
  onOpenChange,
  currentRow: user,
}: UsersDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='overflow-y-auto'>
        <SheetHeader className='text-start'>
          <SheetTitle>{userLabel(user)}</SheetTitle>
          <SheetDescription>mmlabs account details</SheetDescription>
        </SheetHeader>
        <div className='space-y-6 px-4 pb-4'>
          <dl>
            <Field label='ID'>
              <code className='text-xs'>{user.id}</code>
            </Field>
            <Field label='Email'>{user.email}</Field>
            <Field label='Display name'>
              {user.display_name ?? (
                <span className='text-muted-foreground'>Not set</span>
              )}
            </Field>
            <Field label='Status'>
              <UserStatusBadge status={user.status} />
            </Field>
            <Field label='Email verified'>
              {user.email_verified_at ? (
                formatDateTime(user.email_verified_at)
              ) : (
                <span className='text-muted-foreground'>Not verified</span>
              )}
            </Field>
            <Field label='Created at'>{formatDateTime(user.created_at)}</Field>
            <Field label='Updated at'>{formatDateTime(user.updated_at)}</Field>
          </dl>

          <Separator />

          <section
            aria-labelledby='user-apps-roles-heading'
            className='space-y-2'
          >
            <div className='flex items-center gap-2'>
              <h3 id='user-apps-roles-heading' className='font-medium'>
                Apps &amp; roles
              </h3>
              <Badge variant='secondary'>Preview</Badge>
            </div>
            <p className='text-sm text-muted-foreground'>
              Sample data. Role assignments arrive with org-admin-api USR-02.
            </p>
            <ul className='divide-y rounded-md border text-sm'>
              {PREVIEW_APP_ROLES.map((r) => (
                <li key={r.app} className='flex justify-between px-3 py-2'>
                  <span>{r.app}</span>
                  <span className='text-muted-foreground'>{r.role}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
