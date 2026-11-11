import { type UserStatus } from './schema'

export const statusOptions: { label: string; value: UserStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Disabled', value: 'disabled' },
]

export const statusBadgeClass = new Map<UserStatus, string>([
  ['active', 'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200'],
  [
    'disabled',
    'bg-destructive/10 dark:bg-destructive/50 text-destructive dark:text-primary border-destructive/10',
  ],
])

/** Display label for a user: display name when set, otherwise the email. */
export function userLabel(user: {
  email: string
  display_name: string | null
}) {
  return user.display_name ?? user.email
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
    new Date(iso)
  )
}
