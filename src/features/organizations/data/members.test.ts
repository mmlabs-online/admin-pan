import { describe, expect, it } from 'vitest'
import raw from '@/api/openapi.json?raw'
import { invitationStatusLabel, invitationStatusOptions } from './members'

const spec = JSON.parse(raw) as {
  components: { schemas: { InvitationStatus: { enum: string[] } } }
}

describe('invitation statuses', () => {
  it('invitation status values equal the InvitationStatus enum in openapi.json; labels Pending/Accepted/Revoked/Expired; unknown value shown as-is', () => {
    expect(invitationStatusOptions.map((o) => o.value).sort()).toEqual(
      [...spec.components.schemas.InvitationStatus.enum].sort()
    )
    expect(invitationStatusOptions.map((o) => o.label).sort()).toEqual([
      'Accepted',
      'Expired',
      'Pending',
      'Revoked',
    ])
    expect(invitationStatusLabel('pending')).toBe('Pending')
    expect(invitationStatusLabel('suspended')).toBe('suspended')
  })
})
