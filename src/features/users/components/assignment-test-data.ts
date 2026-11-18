import { type components } from '@/api'
import { apiError, json } from '@/test-utils/api'
import { ROLES, VIEWER_ID, pageOf } from '@/features/roles/components/test-data'
import { rolesServer } from '@/features/roles/components/test-fixtures'
import { type Assignment, type RoleHolder } from '../data/assignments'
import { type User } from '../data/schema'

type Organization = components['schemas']['OrganizationRead']

export const stamp = '2026-03-01T00:00:00Z'

export const ADA: User = {
  id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01',
  email: 'ada@example.com',
  display_name: 'Ada Lovelace',
  status: 'active',
  email_verified_at: '2026-02-01T10:00:00Z',
  created_at: '2026-01-15T08:30:00Z',
  updated_at: '2026-02-01T10:00:00Z',
}
export const ANN: User = {
  ...ADA,
  id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c02',
  email: 'ann@example.com',
  display_name: 'Ann Nguyen',
}
export const ANNA: User = {
  ...ADA,
  id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c03',
  email: 'anna@example.com',
  display_name: null,
  status: 'disabled',
}

export const ACME: Organization = {
  id: 'c0000001-0000-4000-8000-000000000001',
  name: 'Acme Corp',
  slug: 'acme',
  description: null,
  status: 'active',
  created_at: stamp,
  updated_at: stamp,
}

export const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: 'e0000001-0000-4000-8000-000000000001',
  app: 'stoktok',
  role_id: VIEWER_ID,
  role_key: 'stoktok:viewer',
  org_id: null,
  granted_by: null,
  expires_at: null,
  active: true,
  created_at: stamp,
  ...over,
})

export const holder = (over: Partial<RoleHolder> = {}): RoleHolder => ({
  ...assignment(),
  user_id: ADA.id,
  email: ADA.email,
  display_name: ADA.display_name,
  user_status: 'active',
  ...over,
})

const path = (req: Request) => new URL(req.url).pathname
export const writes = (seen: Request[], method?: string) =>
  seen.filter((r) => (method ? r.method === method : r.method !== 'GET'))
export const bodyOf = (req: Request) => req.clone().json() as Promise<unknown>

type Options = {
  /** Users the email search searches. */
  users?: User[]
  /** Assignments of ADA; POST and DELETE change this array. */
  assignments?: Assignment[]
  /** Rows of the holders endpoint (any role). */
  holders?: RoleHolder[]
  orgs?: Organization[]
  /** Answer a request first; `undefined` falls through. */
  over?: (req: Request) => Response | Promise<Response> | undefined
}

/**
 * Fake `fetch` handler for the assignment endpoints; apps, role-definitions
 * and permissions come from `rolesServer`. List endpoints honour limit/offset.
 */
export function assignmentsServer(o: Options = {}) {
  const users = o.users ?? [ADA, ANN, ANNA]
  const assignments = o.assignments ?? []
  const orgs = o.orgs ?? [ACME]
  const base = rolesServer(() => apiError(405, 'method_not_allowed'))
  let n = 100
  return (req: Request): Response | Promise<Response> => {
    const custom = o.over?.(req)
    if (custom) return custom
    const url = new URL(req.url)
    const q = url.searchParams
    const limit = Number(q.get('limit') ?? 10)
    const offset = Number(q.get('offset') ?? 0)
    const p = path(req)
    if (p === '/api/v1/users')
      return json(
        pageOf(
          users.filter((u) =>
            u.email.toLowerCase().includes((q.get('email') ?? '').toLowerCase())
          ),
          limit,
          offset
        )
      )
    const mu =
      /^\/api\/v1\/users\/([^/]+)(\/role-assignments)?(?:\/([^/]+))?$/.exec(p)
    if (mu) {
      const user = users.find((u) => u.id === mu[1])
      if (!mu[2]) return user ? json(user) : apiError(404, 'not_found')
      if (req.method === 'GET') return json(pageOf(assignments, limit, offset))
      if (req.method === 'POST')
        return (async () => {
          const body = (await req.clone().json()) as {
            role_id: string
            org_id?: string
            expires_at?: string
          }
          const role = Object.values(ROLES)
            .flat()
            .find((r) => r.id === body.role_id)
          if (!role)
            return apiError(422, 'unprocessable', [
              { field: 'role_id', reason: 'unknown_role' },
            ])
          const row = assignment({
            id: `e0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
            app: role.app,
            role_id: role.id,
            role_key: role.key,
            org_id: body.org_id ?? null,
            expires_at: body.expires_at ?? null,
          })
          assignments.unshift(row)
          return json(row, 201)
        })()
      if (req.method === 'DELETE') {
        const i = assignments.findIndex((a) => a.id === mu[3])
        if (i < 0) return apiError(404, 'not_found')
        assignments.splice(i, 1)
        return new Response(null, { status: 204 })
      }
    }
    if (
      /^\/api\/v1\/apps\/[^/]+\/role-definitions\/[^/]+\/assignments$/.test(p)
    )
      return json(pageOf(o.holders ?? [], limit, offset))
    if (p === '/api/v1/organizations')
      return json(
        pageOf(
          orgs.filter((g) =>
            `${g.name} ${g.slug}`
              .toLowerCase()
              .includes((q.get('q') ?? '').toLowerCase())
          ),
          limit,
          offset
        )
      )
    const mo = /^\/api\/v1\/organizations\/([^/]+)$/.exec(p)
    if (mo) {
      const org = orgs.find((g) => g.id === mo[1])
      return org ? json(org) : apiError(404, 'not_found')
    }
    return base(req)
  }
}
