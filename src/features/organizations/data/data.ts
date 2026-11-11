import { type OrganizationStatus } from './schema'

export const organizationStatuses: {
  label: string
  value: OrganizationStatus
}[] = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
]

export const statusBadgeClasses = new Map<OrganizationStatus, string>([
  ['active', 'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200'],
  [
    'suspended',
    'bg-destructive/10 dark:bg-destructive/50 text-destructive dark:text-primary border-destructive/10',
  ],
])
