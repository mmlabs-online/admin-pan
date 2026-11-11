// Mock data — replaced by org-admin-api USR-02 endpoints (GET /api/v1/apps, /apps/{id}/permissions, /roles, /role-assignments) in a later ticket.
import { faker } from '@faker-js/faker'
import {
  type AccessData,
  type App,
  type JoinPolicy,
  type OrgMode,
  type Permission,
  type Role,
  type RoleAssignment,
  type RolePermission,
  accessDataSchema,
} from './schema'

faker.seed(24680)

const uuid = () => faker.string.uuid()
const REFERENCE_DATE = new Date('2026-11-01T00:00:00Z')
const iso = (d: Date) => d.toISOString()

type PermissionSeed = [
  resourceAction: string,
  description: string,
  isAdmin?: boolean,
]
type RoleSeed = {
  key: string
  name: string
  is_system?: boolean
  // 'all' = every permission of the app, 'member' = all non-admin ones
  permissions: 'all' | 'member' | string[]
}
type AppSeed = {
  key: string
  name: string
  status?: App['status']
  join_policy: JoinPolicy
  org_mode: OrgMode
  origins: string[]
  default_role?: string | null
  members: number
  permissions: PermissionSeed[]
  roles: RoleSeed[]
}

const memberRole: RoleSeed = {
  key: 'member',
  name: 'Member',
  is_system: true,
  permissions: 'member',
}

const appSeeds: AppSeed[] = [
  {
    key: 'admin',
    name: 'mmlabs Admin',
    join_policy: 'closed',
    org_mode: 'none',
    origins: ['https://admin.mmlabs.online'],
    default_role: null,
    members: 6,
    permissions: [
      ['users:read', 'Read identity users', true],
      ['users:write', 'Create, edit and disable users', true],
      ['orgs:read', 'Read organizations', true],
      ['orgs:write', 'Create and edit organizations', true],
      ['apps:write', 'Register and edit apps, roles and permissions', true],
      ['audit:read', 'Read the audit log', true],
    ],
    roles: [
      {
        key: 'super-admin',
        name: 'Super admin',
        is_system: true,
        permissions: 'all',
      },
      {
        key: 'support',
        name: 'Support',
        permissions: ['users:read', 'users:write', 'orgs:read'],
      },
      {
        key: 'auditor',
        name: 'Auditor',
        permissions: ['users:read', 'orgs:read', 'audit:read'],
      },
    ],
  },
  {
    key: 'stoktok',
    name: 'Stoktok',
    join_policy: 'open',
    org_mode: 'none',
    origins: ['https://stoktok.mmlabs.online', 'https://app.stoktok.vn'],
    members: 1284,
    permissions: [
      ['products:read', 'View products'],
      ['products:write', 'Create and edit products'],
      ['orders:read', 'View orders'],
      ['orders:write', 'Create and update orders'],
      ['settings:write', 'Change shop settings', true],
    ],
    roles: [
      memberRole,
      { key: 'owner', name: 'Shop owner', permissions: 'all' },
      {
        key: 'viewer',
        name: 'Viewer',
        permissions: ['products:read', 'orders:read'],
      },
    ],
  },
  {
    key: 'calechip',
    name: 'Calechip',
    join_policy: 'approval',
    org_mode: 'required',
    origins: ['https://calechip.mmlabs.online'],
    members: 342,
    permissions: [
      ['events:read', 'View calendar events'],
      ['events:write', 'Create and edit events'],
      ['members:read', 'View organization members'],
      ['members:write', 'Invite and remove members', true],
    ],
    roles: [
      memberRole,
      { key: 'org-admin', name: 'Organization admin', permissions: 'all' },
    ],
  },
  {
    key: 'tudocuatui',
    name: 'Tu do cua tui',
    join_policy: 'open',
    org_mode: 'none',
    origins: ['https://tudocuatui.mmlabs.online'],
    members: 865,
    permissions: [
      ['items:read', 'View wardrobe items'],
      ['items:write', 'Add and edit wardrobe items'],
      ['reports:read', 'View usage reports', true],
    ],
    roles: [
      memberRole,
      { key: 'moderator', name: 'Moderator', permissions: 'all' },
    ],
  },
  {
    key: 'ricotdin',
    name: 'Ricotdin',
    join_policy: 'approval',
    org_mode: 'none',
    origins: ['https://ricotdin.mmlabs.online'],
    members: 97,
    permissions: [
      ['recipes:read', 'View recipes'],
      ['recipes:write', 'Create and edit recipes'],
      ['recipes:publish', 'Publish recipes', true],
    ],
    roles: [
      memberRole,
      { key: 'editor', name: 'Editor', permissions: 'all' },
      { key: 'reader', name: 'Reader', permissions: ['recipes:read'] },
    ],
  },
  {
    key: 'spacem',
    name: 'SpaceM',
    status: 'disabled',
    join_policy: 'closed',
    org_mode: 'required',
    origins: ['https://spacem.mmlabs.online'],
    members: 12,
    permissions: [
      ['spaces:read', 'View spaces'],
      ['spaces:write', 'Create and edit spaces'],
      ['bookings:write', 'Book a space'],
      ['billing:read', 'View billing', true],
    ],
    roles: [
      memberRole,
      { key: 'manager', name: 'Space manager', permissions: 'all' },
    ],
  },
  {
    key: 'surveyai',
    name: 'SurveyAI',
    join_policy: 'open',
    org_mode: 'required',
    origins: ['https://surveyai.mmlabs.online', 'https://surveyai.app'],
    members: 410,
    permissions: [
      ['surveys:read', 'View surveys'],
      ['surveys:write', 'Create and edit surveys'],
      ['responses:read', 'View survey responses'],
      ['responses:export', 'Export survey responses', true],
    ],
    roles: [
      memberRole,
      {
        key: 'analyst',
        name: 'Analyst',
        permissions: ['surveys:read', 'responses:read', 'responses:export'],
      },
      { key: 'org-admin', name: 'Organization admin', permissions: 'all' },
    ],
  },
  {
    key: 'seatmgt',
    name: 'Seat management',
    join_policy: 'approval',
    org_mode: 'required',
    origins: ['https://seatmgt.mmlabs.online'],
    members: 58,
    permissions: [
      ['seats:read', 'View seat maps'],
      ['seats:assign', 'Assign seats'],
      ['floors:write', 'Edit floor plans', true],
    ],
    roles: [
      memberRole,
      { key: 'facility-admin', name: 'Facility admin', permissions: 'all' },
    ],
  },
]

const userEmails = [
  'linh.tran@mmlabs.online',
  'minh.nguyen@mmlabs.online',
  'an.pham@mmlabs.online',
  'hoa.le@example.com',
  'quang.do@example.com',
  'thao.vo@example.com',
  'khanh.bui@example.com',
  'tuan.hoang@example.com',
]
const orgNames = [
  'Acme Coffee',
  'Saigon Books',
  'Hanoi Dental Clinic',
  'Blue Lotus Spa',
]

function buildAccessData(): AccessData {
  const apps: App[] = []
  const permissions: Permission[] = []
  const roles: Role[] = []
  const role_permissions: RolePermission[] = []

  for (const seed of appSeeds) {
    const appId = uuid()
    const created = faker.date.past({ years: 2, refDate: REFERENCE_DATE })
    const updated = faker.date.between({ from: created, to: REFERENCE_DATE })

    const appPermissions = seed.permissions.map(
      ([resourceAction, description, isAdmin]): Permission => ({
        id: uuid(),
        app_id: appId,
        key: `${seed.key}:${resourceAction}`,
        description,
        is_admin: isAdmin ?? false,
      })
    )
    permissions.push(...appPermissions)

    let defaultRoleId: string | null = null
    for (const roleSeed of seed.roles) {
      const role: Role = {
        id: uuid(),
        app_id: appId,
        key: `${seed.key}:${roleSeed.key}`,
        name: roleSeed.name,
        is_system: roleSeed.is_system ?? false,
      }
      roles.push(role)
      if (roleSeed.key === (seed.default_role ?? 'member'))
        defaultRoleId = role.id

      const granted =
        roleSeed.permissions === 'all'
          ? appPermissions
          : roleSeed.permissions === 'member'
            ? appPermissions.filter((p) => !p.is_admin)
            : appPermissions.filter((p) =>
                (roleSeed.permissions as string[]).includes(
                  p.key.slice(seed.key.length + 1)
                )
              )
      for (const p of granted) {
        role_permissions.push({ role_id: role.id, permission_id: p.id })
      }
    }

    apps.push({
      id: appId,
      key: seed.key,
      name: seed.name,
      status: seed.status ?? 'active',
      join_policy: seed.join_policy,
      default_role_id: defaultRoleId,
      org_mode: seed.org_mode,
      origins: seed.origins,
      created_at: iso(created),
      updated_at: iso(updated),
    })
  }

  const users = userEmails.map((email) => ({ id: uuid(), email }))
  const orgs = orgNames.map((name) => ({ id: uuid(), name }))
  const roleByKey = (key: string) => roles.find((r) => r.key === key)!
  const userByEmail = (email: string) => users.find((u) => u.email === email)!
  const orgByName = (name: string) => orgs.find((o) => o.name === name)!
  const grantor = userByEmail('linh.tran@mmlabs.online')

  const assignmentSeeds: [
    email: string,
    roleKey: string,
    org: string | null,
    expires: string | null,
  ][] = [
    ['linh.tran@mmlabs.online', 'admin:super-admin', null, null],
    ['minh.nguyen@mmlabs.online', 'admin:support', null, null],
    ['an.pham@mmlabs.online', 'admin:auditor', null, '2027-03-31T00:00:00Z'],
    ['hoa.le@example.com', 'stoktok:owner', null, null],
    ['quang.do@example.com', 'stoktok:viewer', null, '2026-12-31T00:00:00Z'],
    ['thao.vo@example.com', 'calechip:org-admin', 'Acme Coffee', null],
    ['khanh.bui@example.com', 'calechip:member', 'Acme Coffee', null],
    ['khanh.bui@example.com', 'calechip:member', 'Saigon Books', null],
    ['tuan.hoang@example.com', 'surveyai:analyst', 'Hanoi Dental Clinic', null],
    ['hoa.le@example.com', 'seatmgt:facility-admin', 'Blue Lotus Spa', null],
  ]
  const role_assignments: RoleAssignment[] = assignmentSeeds.map(
    ([email, roleKey, org, expires]) => ({
      id: uuid(),
      user_id: userByEmail(email).id,
      role_id: roleByKey(roleKey).id,
      org_id: org ? orgByName(org).id : null,
      granted_by: grantor.id,
      expires_at: expires,
      created_at: iso(faker.date.past({ years: 1, refDate: REFERENCE_DATE })),
    })
  )

  const app_member_counts = Object.fromEntries(
    apps.map((app, i) => [app.id, appSeeds[i].members])
  )

  return accessDataSchema.parse({
    apps,
    permissions,
    roles,
    role_permissions,
    role_assignments,
    users,
    orgs,
    app_member_counts,
  })
}

export const initialAccessData: AccessData = buildAccessData()

/** The staff account that grants roles in this mock (replaced by the signed-in account). */
export const CURRENT_STAFF_ID = initialAccessData.users[0].id
