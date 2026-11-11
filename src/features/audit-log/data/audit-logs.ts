// Mock data — replaced by org-admin-api ADM-004 `GET /api/v1/audit-logs` (permission admin:audit:read).
import { faker } from '@faker-js/faker'
import { maskEmail } from '../lib/format'
import { auditAppKeys } from './data'
import {
  type AuditAction,
  type AuditChanges,
  type AuditLogEntry,
  type AuditTargetType,
  auditLogListSchema,
} from './schema'

faker.seed(40404)

const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.now()

const staff = Array.from({ length: 8 }, () => {
  const firstName = faker.person.firstName()
  return {
    id: faker.string.uuid(),
    email: faker.internet
      .email({ firstName, provider: 'mmlabs.online' })
      .toLowerCase(),
  }
})

const members = Array.from({ length: 30 }, () => {
  const firstName = faker.person.firstName()
  return {
    id: faker.string.uuid(),
    email: faker.internet.email({ firstName }).toLowerCase(),
  }
})

const orgs = Array.from({ length: 10 }, () => {
  const name = faker.company.name()
  return {
    id: faker.string.uuid(),
    name,
    slug: faker.helpers.slugify(name).toLowerCase(),
  }
})

const roles = ['org_admin', 'org_member', 'viewer', 'support'] as const

const weightedActions: { weight: number; value: AuditAction }[] = [
  { weight: 30, value: 'auth.login.success' },
  { weight: 8, value: 'auth.login.failure' },
  { weight: 12, value: 'auth.logout' },
  { weight: 5, value: 'user.disable' },
  { weight: 4, value: 'user.enable' },
  { weight: 3, value: 'organization.create' },
  { weight: 7, value: 'organization.update' },
  { weight: 1, value: 'organization.delete' },
  { weight: 6, value: 'role.assign' },
  { weight: 3, value: 'role.revoke' },
  { weight: 3, value: 'app.update' },
  { weight: 6, value: 'app.join' },
]

type Draft = {
  actor: { id: string; email: string } | null
  target_type: AuditTargetType
  target_id: string
  app_key: string | null
  org_id: string | null
  changes: AuditChanges | null
}

function draftFor(action: AuditAction): Draft {
  const admin = faker.helpers.arrayElement(staff)
  const member = faker.helpers.arrayElement(members)
  const org = faker.helpers.arrayElement(orgs)
  const app = faker.helpers.arrayElement(auditAppKeys)
  const session = faker.string.uuid()

  switch (action) {
    case 'auth.login.success':
      return {
        actor: member,
        target_type: 'session',
        target_id: session,
        app_key: app,
        org_id: faker.helpers.maybe(() => org.id) ?? null,
        changes: null,
      }
    case 'auth.logout':
      return {
        actor: member,
        target_type: 'session',
        target_id: session,
        app_key: app,
        org_id: null,
        changes: null,
      }
    case 'auth.login.failure': {
      const unknown = faker.datatype.boolean({ probability: 0.4 })
      if (unknown) {
        // Unknown account: no user id, and the attempted email is masked.
        return {
          actor: {
            id: '',
            email: maskEmail(faker.internet.email().toLowerCase()),
          },
          target_type: 'session',
          target_id: session,
          app_key: app,
          org_id: null,
          changes: { after: { reason: 'unknown_account' } },
        }
      }
      return {
        actor: member,
        target_type: 'user',
        target_id: member.id,
        app_key: app,
        org_id: null,
        changes: {
          after: {
            reason: 'invalid_credentials',
            failed_attempts: faker.number.int({ min: 1, max: 5 }),
          },
        },
      }
    }
    case 'user.disable': {
      const bySystem = faker.datatype.boolean({ probability: 0.25 })
      return {
        actor: bySystem ? null : admin,
        target_type: 'user',
        target_id: member.id,
        app_key: null,
        org_id: null,
        changes: {
          before: { status: 'active' },
          after: {
            status: 'disabled',
            reason: bySystem ? 'too_many_failed_logins' : 'manual',
          },
        },
      }
    }
    case 'user.enable':
      return {
        actor: admin,
        target_type: 'user',
        target_id: member.id,
        app_key: null,
        org_id: null,
        changes: {
          before: { status: 'disabled' },
          after: { status: 'active' },
        },
      }
    case 'organization.create':
      return {
        actor: admin,
        target_type: 'organization',
        target_id: org.id,
        app_key: null,
        org_id: org.id,
        changes: {
          after: { name: org.name, slug: org.slug, status: 'active' },
        },
      }
    case 'organization.update': {
      const newName = faker.company.name()
      return {
        actor: admin,
        target_type: 'organization',
        target_id: org.id,
        app_key: null,
        org_id: org.id,
        changes: faker.helpers.arrayElement<AuditChanges>([
          {
            before: { name: org.name, slug: org.slug },
            after: { name: newName, slug: org.slug },
          },
          {
            before: { status: 'active' },
            after: { status: 'suspended' },
          },
          {
            before: { status: 'suspended' },
            after: { status: 'active' },
          },
        ]),
      }
    }
    case 'organization.delete':
      return {
        actor: admin,
        target_type: 'organization',
        target_id: org.id,
        app_key: null,
        org_id: org.id,
        changes: {
          before: { name: org.name, slug: org.slug, status: 'suspended' },
        },
      }
    case 'role.assign':
    case 'role.revoke': {
      const grant = {
        user_id: member.id,
        role: faker.helpers.arrayElement(roles),
        app_key: app,
        org_id: org.id,
      }
      return {
        actor: admin,
        target_type: 'role',
        target_id: faker.string.uuid(),
        app_key: app,
        org_id: org.id,
        changes:
          action === 'role.assign' ? { after: grant } : { before: grant },
      }
    }
    case 'app.update': {
      const origins = [`https://${app}.mmlabs.online`]
      return {
        actor: admin,
        target_type: 'app',
        target_id: app,
        app_key: app,
        org_id: null,
        changes: faker.helpers.arrayElement<AuditChanges>([
          {
            before: { origins },
            after: { origins: [...origins, 'http://localhost:5173'] },
          },
          {
            before: { join_policy: 'invite_only', default_role: 'viewer' },
            after: { join_policy: 'open', default_role: 'viewer' },
          },
        ]),
      }
    }
    case 'app.join':
      return {
        actor: member,
        target_type: 'app',
        target_id: app,
        app_key: app,
        org_id: faker.helpers.maybe(() => org.id) ?? null,
        changes: { after: { role: 'viewer' } },
      }
  }
}

const entries: AuditLogEntry[] = Array.from({ length: 400 }, () => {
  const action = faker.helpers.weightedArrayElement(weightedActions)
  const draft = draftFor(action)
  return {
    id: faker.string.uuid(),
    occurred_at: new Date(
      now - faker.number.int({ min: 0, max: 30 * DAY_MS })
    ).toISOString(),
    actor_user_id: draft.actor?.id || null,
    actor_email: draft.actor?.email ?? null,
    action,
    target_type: draft.target_type,
    target_id: draft.target_id,
    app_key: draft.app_key,
    org_id: draft.org_id,
    changes: draft.changes,
    ip: faker.internet.ipv4(),
    user_agent: faker.internet.userAgent(),
    request_id: `req_${faker.string.alphanumeric({ length: 20, casing: 'lower' })}`,
  }
})

/** ~400 entries over the last 30 days, newest first (as the API returns them). */
export const auditLogs: AuditLogEntry[] = auditLogListSchema
  .parse(entries)
  .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
