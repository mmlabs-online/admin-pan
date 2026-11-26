import { QueryClient } from '@tanstack/react-query'
import { fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import {
  INVITATIONS,
  MEMBERS,
  ORGS,
  invitationsPage,
  membersPage,
} from '../components/test-data'
import {
  orgInvitationsKeys,
  orgInvitationsQueryOptions,
  orgMembersKeys,
  orgMembersQueryOptions,
} from './members'
import { organizationsKeys } from './queries'

const ORG = ORGS[0].id

describe('org members and invitations queries', () => {
  it('orgMembersKeys.list and orgInvitationsKeys.list are under organizationsKeys.detail(org) and not under organizationsKeys.lists(); different status → different key', () => {
    const members = orgMembersKeys.list(ORG, { limit: 20, offset: 0 })
    const invitations = orgInvitationsKeys.list(ORG, { limit: 20, offset: 0 })
    for (const key of [members, invitations]) {
      expect(key.slice(0, 3)).toEqual(organizationsKeys.detail(ORG))
      expect(key.slice(0, 2)).not.toEqual(organizationsKeys.lists())
    }
    expect(members.slice(0, 4)).toEqual(orgMembersKeys.all(ORG))
    expect(invitations.slice(0, 4)).toEqual(orgInvitationsKeys.all(ORG))
    expect(
      orgInvitationsKeys.list(ORG, { limit: 20, offset: 0, status: 'pending' })
    ).not.toEqual(
      orgInvitationsKeys.list(ORG, { limit: 20, offset: 0, status: 'expired' })
    )
  })

  it('orgMembersQueryOptions sends GET /api/v1/organizations/{id}/members?limit=20&offset=0 (no app, no active) and returns the page', async () => {
    const body = membersPage(MEMBERS[ORG])
    const { client, seen } = fakeApi(() => json(body))
    const data = await new QueryClient().fetchQuery(
      orgMembersQueryOptions(ORG, { limit: 20, offset: 0 }, client)
    )
    expect(data).toEqual(body)
    expect(seen[0].url).toBe(
      `https://api.test/api/v1/organizations/${ORG}/members?limit=20&offset=0`
    )
  })

  it('orgInvitationsQueryOptions sends ?limit=20&offset=0&status=pending when status is given and no status param when it is undefined', async () => {
    const { client, seen } = fakeApi(() =>
      json(invitationsPage(INVITATIONS[ORG]))
    )
    const qc = new QueryClient()
    await qc.fetchQuery(
      orgInvitationsQueryOptions(
        ORG,
        { limit: 20, offset: 0, status: 'pending' },
        client
      )
    )
    await qc.fetchQuery(
      orgInvitationsQueryOptions(ORG, { limit: 20, offset: 0 }, client)
    )
    const params = (i: number) => new URL(seen[i].url).searchParams
    expect(params(0).get('status')).toBe('pending')
    expect(params(0).get('limit')).toBe('20')
    expect(params(0).get('offset')).toBe('0')
    expect(params(1).has('status')).toBe(false)
  })
})
