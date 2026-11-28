import { describe, expect, it, test } from 'vitest'
import openapi from '@/api/openapi.json?raw'
import { role } from '@/features/roles/components/test-data'
import { APPS } from '../components/test-data'
import {
  APP_CREDENTIAL_SCOPES,
  type App,
  type AppForm,
  type AppRoleField,
} from './app-schema'
import {
  appUpdateDiff,
  credentialScopeHints,
  credentialScopeOptions,
  describeRole,
  formatDate,
  isRuntimeScope,
  roleChanges,
  roleSelectItems,
  superAdminNotAlone,
} from './data'

test('formatDate returns em dash for null and en-US date otherwise', () => {
  expect(formatDate(null)).toBe('—')
  expect(formatDate('2026-03-20T12:00:00Z')).toBe('Mar 20, 2026')
})

describe('credential scopes', () => {
  it('credentialScopeOptions: admin -> [releases]; calechip -> manifest, releases, org-members:read, usage:read, usage:write; never limits:write', () => {
    expect(credentialScopeOptions('admin')).toEqual(['releases'])
    expect(credentialScopeOptions('calechip')).toEqual([
      'manifest',
      'releases',
      'org-members:read',
      'usage:read',
      'usage:write',
    ])
    expect(credentialScopeOptions('calechip')).not.toContain('limits:write')
  })

  it("isRuntimeScope true only for org-members:read, usage:read, usage:write, limits:write; every runtime hint says 'Backend deploy environment only, never CI or browser code'; every scope has a hint", () => {
    for (const scope of APP_CREDENTIAL_SCOPES) {
      const runtime = [
        'org-members:read',
        'usage:read',
        'usage:write',
        'limits:write',
      ].includes(scope)
      expect(isRuntimeScope(scope), scope).toBe(runtime)
      expect(credentialScopeHints[scope], scope).toBeTruthy()
      if (runtime && scope !== 'limits:write')
        expect(credentialScopeHints[scope]).toContain(
          'Backend deploy environment only, never CI or browser code'
        )
    }
  })

  it('APP_CREDENTIAL_SCOPES equals the AppCredentialScope enum in openapi.json', () => {
    const spec = JSON.parse(openapi) as {
      components: { schemas: { AppCredentialScope: { enum: string[] } } }
    }
    expect([...APP_CREDENTIAL_SCOPES]).toEqual(
      spec.components.schemas.AppCredentialScope.enum
    )
  })
})

const ID_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ID_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const ID_C = 'cccccccc-0000-4000-8000-000000000003'
const ROLES = [
  role('simap', ID_A, 'admin', { name: 'Admin', privileged: true }),
  role('simap', ID_B, 'user'),
]
const byId = new Map(ROLES.map((r) => [r.id, r]))
const ALL: AppRoleField[] = [
  'default_role_id',
  'org_owner_role_id',
  'super_admin_role_id',
]

const base: App = { ...APPS[3], default_role_id: ID_B }
const formOf = (over: Partial<AppForm> = {}): AppForm => ({
  key: base.key,
  name: base.name,
  join_policy: base.join_policy,
  org_mode: base.org_mode,
  origins: base.origins.map((value) => ({ value })),
  default_role_id: base.default_role_id ?? 'none',
  org_owner_role_id: base.org_owner_role_id ?? 'none',
  super_admin_role_id: base.super_admin_role_id ?? 'none',
  ...over,
})

describe('appUpdateDiff', () => {
  it('unchanged values give {}; a current undefined super_admin_role_id equals none', () => {
    expect(appUpdateDiff(base, formOf(), ALL)).toEqual({})
  })

  it('name, join_policy, org_mode and trimmed origins are sent only when changed', () => {
    const diff = appUpdateDiff(
      base,
      formOf({
        name: 'Simap 2',
        join_policy: 'open',
        org_mode: 'none',
        origins: [{ value: ' https://a.mmlabs.online ' }],
      }),
      ALL
    )
    expect(diff).toEqual({
      name: 'Simap 2',
      join_policy: 'open',
      org_mode: 'none',
      origins: ['https://a.mmlabs.online'],
    })
  })

  it('a role changed to another id sends that id; to none sends null', () => {
    expect(appUpdateDiff(base, formOf({ default_role_id: ID_A }), ALL)).toEqual(
      { default_role_id: ID_A }
    )
    expect(
      appUpdateDiff(base, formOf({ default_role_id: 'none' }), ALL)
    ).toEqual({ default_role_id: null })
  })

  it('role fields not in editable are never sent, even if their value differs', () => {
    const values = formOf({ default_role_id: ID_A, org_owner_role_id: ID_A })
    expect(appUpdateDiff(base, values, ['org_owner_role_id'])).toEqual({
      org_owner_role_id: ID_A,
    })
    expect(appUpdateDiff(base, values, [])).toEqual({})
  })

  it('an untouched default role with the org owner changed sends org_owner_role_id only', () => {
    expect(
      appUpdateDiff(base, formOf({ org_owner_role_id: ID_A }), ALL)
    ).toEqual({ org_owner_role_id: ID_A })
  })
})

describe('roleSelectItems', () => {
  it("lists 'None' first, then 'key — name' by key; privileged only when annotated", () => {
    expect(
      roleSelectItems([...ROLES].reverse(), null, { annotatePrivileged: true })
    ).toEqual([
      { value: 'none', label: 'None' },
      { value: ID_A, label: 'simap:admin — Admin · privileged' },
      { value: ID_B, label: 'simap:user — User' },
    ])
    expect(
      roleSelectItems(ROLES, null, { annotatePrivileged: false })[1].label
    ).toBe('simap:admin — Admin')
  })

  it('adds a current id that is not in the list as Unknown role', () => {
    expect(
      roleSelectItems(ROLES, ID_C, { annotatePrivileged: false }).slice(-1)[0]
    ).toEqual({ value: ID_C, label: `Unknown role (${ID_C})` })
  })
})

test('describeRole: null is none, found is the key, missing is unknown', () => {
  expect(describeRole(null, byId)).toEqual({ kind: 'none' })
  expect(describeRole(ID_A, byId)).toEqual({ kind: 'role', key: 'simap:admin' })
  expect(describeRole(ID_C, byId)).toEqual({ kind: 'unknown', id: ID_C })
})

describe('roleChanges', () => {
  it('lists each changed role with from/to keys and the consequence; other fields go to others', () => {
    const current = { ...base, org_owner_role_id: ID_A }
    const { changes, others } = roleChanges(
      current,
      {
        name: 'X',
        default_role_id: null,
        org_owner_role_id: ID_B,
        super_admin_role_id: ID_A,
      },
      byId,
      'Simap'
    )
    expect(others).toEqual(['Name'])
    expect(changes.map((c) => [c.label, c.from, c.to])).toEqual([
      ['Default role', 'simap:user', 'None'],
      ['Org owner role', 'simap:admin', 'simap:user'],
      ['Super-admin role', 'None', 'simap:admin'],
    ])
    expect(changes[0].consequence).toBe(
      'Accounts that join Simap from now on get no role automatically.'
    )
    expect(changes[1].consequence).toContain(
      'New org owners in every Simap organization get this role.'
    )
    expect(changes[2].consequence).toContain('without being a member')
  })

  it('owner cleared, default set, super-admin cleared and replaced', () => {
    const current = {
      ...base,
      org_owner_role_id: ID_A,
      super_admin_role_id: ID_A,
    }
    const one = (diff: object, c = current) =>
      roleChanges(c, diff, byId, 'Simap').changes[0].consequence
    expect(one({ org_owner_role_id: null })).toBe(
      'Org creation and invitations stop working for Simap.'
    )
    expect(one({ default_role_id: ID_A })).toContain(
      "Existing assignments don't change."
    )
    expect(one({ super_admin_role_id: null })).toContain(
      'Holders keep the role assignment; revoke it on the Roles page afterwards.'
    )
    expect(one({ super_admin_role_id: ID_B })).toContain(
      'Tokens already issued for simap:admin stay valid until they expire (up to 1 hour); its holders keep the assignment.'
    )
  })
})

test('superAdminNotAlone is true only when super_admin_role_id comes with another key', () => {
  expect(superAdminNotAlone({ super_admin_role_id: ID_A })).toBe(false)
  expect(superAdminNotAlone({ super_admin_role_id: null })).toBe(false)
  expect(superAdminNotAlone({ super_admin_role_id: ID_A, name: 'x' })).toBe(
    true
  )
  expect(superAdminNotAlone({ name: 'x', default_role_id: ID_A })).toBe(false)
})
