import { type components } from '@/api'

export type OrgMember = components['schemas']['OrgMemberRead']
export type OrgInvitation = components['schemas']['OrgInvitationRead']
export type InvitationStatus = components['schemas']['InvitationStatus']

/** Value of the "All statuses" filter option; it sends no `status` param. */
export const ALL_STATUSES = 'all'

export const invitationStatusOptions: {
  label: string
  value: InvitationStatus
}[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Revoked', value: 'revoked' },
  { label: 'Expired', value: 'expired' },
]

/** The label, or the raw value if the API adds a status this UI does not know. */
export function invitationStatusLabel(status: string): string {
  return (
    invitationStatusOptions.find((o) => o.value === status)?.label ?? status
  )
}
