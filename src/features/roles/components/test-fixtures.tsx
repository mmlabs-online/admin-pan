/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { render } from 'vitest-browser-react'
import { ADMIN_PERMISSIONS } from '@/lib/permissions/registry'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { type App, type Permission } from '@/features/apps/data/app-schema'
import { type RoleDefinition } from '../data/role-schema'
import { RolesContent } from '../index'
import { APPS, PERMISSIONS, ROLES, pageOf } from './test-data'

function Harness({
  initial,
  client,
}: {
  initial: Record<string, unknown>
  client: ApiClient
}) {
  const [search, setSearch] = useState<Record<string, unknown>>(initial)
  const navigate: NavigateFn = ({ search: next }) => {
    if (next === true) return
    setSearch((prev) => (typeof next === 'function' ? next(prev) : next))
  }
  return (
    <>
      <code data-testid='search'>{JSON.stringify(search)}</code>
      <RolesContent search={search} navigate={navigate} api={client} />
    </>
  )
}

/**
 * The Roles page without router/header, on an injected API client with its
 * own URL state. Everything is granted unless `granted` is given.
 */
export function renderRoles(
  client: ApiClient,
  opts: {
    granted?: Parameters<typeof WithPermissions>[0]['granted']
    search?: Record<string, unknown>
    queryClient?: QueryClient
  } = {}
) {
  return render(
    <QueryClientProvider client={opts.queryClient ?? testQueryClient()}>
      <WithPermissions granted={opts.granted ?? ADMIN_PERMISSIONS}>
        <Harness initial={opts.search ?? {}} client={client} />
      </WithPermissions>
    </QueryClientProvider>
  )
}

const path = (req: Request) => new URL(req.url).pathname
export const writes = (seen: Request[], method?: string) =>
  seen.filter((r) => (method ? r.method === method : r.method !== 'GET'))
export const bodyOf = (req: Request) => req.clone().json() as Promise<unknown>

type Fixtures = {
  apps?: () => App[]
  roles?: (app: string) => RoleDefinition[]
  permissions?: (app: string) => Permission[]
}

/**
 * Fake `fetch` handler: GETs answer from the fixtures (each read per request,
 * so a test can change what a refetch returns); any other method goes to
 * `write`. List endpoints honour limit/offset.
 */
export function rolesServer(
  write: (req: Request) => Response | Promise<Response>,
  fx: Fixtures = {}
) {
  const apps = fx.apps ?? (() => APPS)
  const roles = fx.roles ?? ((k: string) => ROLES[k] ?? [])
  const perms = fx.permissions ?? ((k: string) => PERMISSIONS[k] ?? [])
  return (req: Request) => {
    if (req.method !== 'GET') return write(req)
    const q = new URL(req.url).searchParams
    const limit = Number(q.get('limit') ?? 10)
    const offset = Number(q.get('offset') ?? 0)
    const p = path(req)
    if (p === '/api/v1/apps') return json(pageOf(apps(), limit, offset))
    const m =
      /^\/api\/v1\/apps\/([^/]+)(?:\/(role-definitions|permissions)(?:\/([^/]+))?)?$/.exec(
        p
      )
    const app = apps().find((a) => a.key === m?.[1])
    if (!m || !app) return apiError(404, 'not_found')
    if (m[2] === 'role-definitions') {
      if (!m[3]) return json(pageOf(roles(app.key), limit, offset))
      const one = roles(app.key).find((r) => r.id === m[3])
      return one ? json(one) : apiError(404, 'not_found')
    }
    if (m[2] === 'permissions')
      return json(pageOf(perms(app.key), limit, offset))
    return json(app)
  }
}
