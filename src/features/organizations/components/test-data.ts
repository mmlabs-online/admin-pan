import { type components } from '@/api'
import { type Entitlement } from '../data/entitlement-schema'
import { type OrgInvitation, type OrgMember } from '../data/members'
import { type Organization } from '../data/schema'

export const ORGS: Organization[] = [
  {
    id: '6f1c2c1e-7a4b-4a53-9f0e-1d2c3b4a5e60',
    slug: 'acme',
    name: 'Acme Corp',
    description: 'Rockets and anvils',
    status: 'active',
    created_by: null,
    created_at: '2026-01-05T10:00:00.000Z',
    updated_at: '2026-01-05T10:00:00.000Z',
  },
  {
    id: '7a2d3e4f-5b6c-4d7e-8f90-a1b2c3d4e5f6',
    slug: 'globex',
    name: 'Globex',
    description: null,
    status: 'suspended',
    created_by: '0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e',
    created_at: '2026-02-10T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z',
  },
  {
    id: '8b3e4f5a-6c7d-4e8f-9a01-b2c3d4e5f6a7',
    slug: 'initech',
    name: 'Initech',
    description: 'TPS reports',
    status: 'active',
    created_by: null,
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-03-15T10:00:00.000Z',
  },
]

/** A `Page<OrganizationRead>` body. */
export const orgsPage = (
  items: Organization[] = ORGS,
  total = items.length,
  limit = 10,
  offset = 0
) => ({ items, total, limit, offset })

const stamp = '2026-01-05T10:00:00.000Z'
const ACME = ORGS[0].id
const GLOBEX = ORGS[1].id

const entitlement = (over: Partial<Entitlement>): Entitlement => ({
  id: '9a9a9a9a-9999-4999-8999-999999999991',
  org_id: ACME,
  app_key: 'calechip',
  plan: 'pro',
  limits: { seats: 10 },
  enabled: true,
  active: true,
  created_at: stamp,
  updated_at: '2026-02-10T10:00:00.000Z',
  ...over,
})

/** Entitlements by org id. Acme: calechip + stoktok; Globex (suspended): one inactive. */
export const ENTITLEMENTS: Record<string, Entitlement[]> = {
  [ACME]: [
    entitlement({}),
    entitlement({
      id: '9a9a9a9a-9999-4999-8999-999999999992',
      app_key: 'stoktok',
      plan: 'free',
      limits: {},
      enabled: false,
      active: false,
    }),
  ],
  [GLOBEX]: [
    entitlement({
      id: '9a9a9a9a-9999-4999-8999-999999999993',
      org_id: GLOBEX,
      limits: { seats: 5 },
      active: false,
    }),
  ],
  [ORGS[2].id]: [],
}

/** A `Page<EntitlementRead>` body. */
export const entitlementsPage = (
  items: Entitlement[],
  total = items.length
) => ({ items, total, limit: 100, offset: 0 })

const member = (over: Partial<OrgMember>): OrgMember => ({
  assignment_id: 'a1a1a1a1-1111-4111-8111-000000000001',
  user_id: 'bbbbbbbb-1111-4111-8111-000000000001',
  email: 'ada@example.com',
  display_name: 'Ada Lovelace',
  user_status: 'active',
  app: 'calechip',
  role_id: 'c1c1c1c1-1111-4111-8111-000000000001',
  role_key: 'admin',
  role_name: 'Administrator',
  granted_by: null,
  created_at: '2026-02-01T10:00:00.000Z',
  expires_at: null,
  active: true,
  ...over,
})

/** Role assignments by org id. Acme: Ada twice, a disabled user without a name, one expired row. */
export const MEMBERS: Record<string, OrgMember[]> = {
  [ACME]: [
    member({}),
    member({
      assignment_id: 'a1a1a1a1-1111-4111-8111-000000000002',
      role_id: 'c1c1c1c1-1111-4111-8111-000000000002',
      role_key: 'member',
      role_name: 'Member',
    }),
    member({
      assignment_id: 'a1a1a1a1-1111-4111-8111-000000000003',
      user_id: 'bbbbbbbb-2222-4222-8222-000000000002',
      email: 'grace@example.com',
      display_name: null,
      user_status: 'disabled',
      app: 'stoktok',
      role_key: 'viewer',
      role_name: 'Viewer',
      expires_at: '2026-03-01T10:00:00.000Z',
      active: false,
    }),
  ],
  [GLOBEX]: [],
  [ORGS[2].id]: [],
}

/** A `Page<OrgMemberRead>` body. */
export const membersPage = (
  items: OrgMember[],
  total = items.length,
  limit = 20,
  offset = 0
) => ({ items, total, limit, offset })

const invitation = (over: Partial<OrgInvitation>): OrgInvitation => ({
  id: 'd1d1d1d1-1111-4111-8111-000000000001',
  app: 'calechip',
  role_id: 'c1c1c1c1-1111-4111-8111-000000000002',
  role_key: 'member',
  invited_by: null,
  created_at: '2026-04-01T10:00:00.000Z',
  expires_at: '2026-04-08T10:00:00.000Z',
  accepted_at: null,
  accepted_by: null,
  revoked_at: null,
  status: 'pending',
  ...over,
})

/** Invitations by org id. Acme: one per status. */
export const INVITATIONS: Record<string, OrgInvitation[]> = {
  [ACME]: [
    invitation({}),
    invitation({
      id: 'd1d1d1d1-1111-4111-8111-000000000002',
      role_key: 'admin',
      accepted_at: '2026-04-02T10:00:00.000Z',
      status: 'accepted',
    }),
    invitation({
      id: 'd1d1d1d1-1111-4111-8111-000000000003',
      app: 'stoktok',
      role_key: 'viewer',
      revoked_at: '2026-04-03T10:00:00.000Z',
      status: 'revoked',
    }),
    invitation({
      id: 'd1d1d1d1-1111-4111-8111-000000000004',
      role_key: 'owner',
      status: 'expired',
    }),
  ],
  [GLOBEX]: [],
  [ORGS[2].id]: [],
}

/** A `Page<OrgInvitationRead>` body. */
export const invitationsPage = (
  items: OrgInvitation[],
  total = items.length,
  limit = 20,
  offset = 0
) => ({ items, total, limit, offset })

type AppRead = components['schemas']['AppRead']
let appCount = 0
const app = (key: string, over: Partial<AppRead> = {}): AppRead => ({
  id: `1a1a1a1a-1111-4111-8111-${String(++appCount).padStart(12, '0')}`,
  key,
  name: key[0].toUpperCase() + key.slice(1),
  status: 'active',
  join_policy: 'open',
  org_mode: 'required',
  origins: [],
  default_role_id: null,
  org_owner_role_id: null,
  member_count: 0,
  created_at: stamp,
  updated_at: stamp,
  ...over,
})

/** Apps for the grant picker: only `calechip` and `zenith` are eligible for Acme (`stoktok` is granted). */
export const PICKER_APPS: AppRead[] = [
  app('admin', { org_mode: 'none', join_policy: 'closed' }),
  app('calechip'),
  app('stoktok'),
  app('zenith'),
  app('dormant', { status: 'disabled' }),
  app('solo', { org_mode: 'none' }),
]
