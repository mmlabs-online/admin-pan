/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { type ApiClient } from '@/api'
import { apiError, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { render } from 'vitest-browser-react'
import { ADMIN_PERMISSIONS } from '@/lib/permissions/registry'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { RegisterAppButton } from '../index'
import { AppsDialogs } from './apps-dialogs'
import { AppsProvider } from './apps-provider'
import { AppsTable } from './apps-table'
import {
  APPS,
  CREDENTIALS,
  JOIN_REQUESTS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
  appsPage,
  credentialsPage,
  joinRequestsPage,
  permissionsPage,
  roleDefinitionsPage,
} from './test-data'

function TableWithUrlState({
  initial,
  back,
}: {
  initial: Record<string, unknown>
  back?: Record<string, unknown>
}) {
  const [search, setSearch] = useState<Record<string, unknown>>(initial)
  const navigate: NavigateFn = ({ search: next }) => {
    if (next === true) return
    setSearch((prev) => (typeof next === 'function' ? next(prev) : next))
  }
  return (
    <>
      <code data-testid='search'>{JSON.stringify(search)}</code>
      {back && (
        <button type='button' onClick={() => setSearch(back)}>
          Simulate back
        </button>
      )}
      <AppsTable search={search} navigate={navigate} />
    </>
  )
}

/**
 * Page without router/header: provider + register button + table + dialogs
 * on an injected API client. Everything is granted unless `granted` is given.
 */
export function renderApps(
  client: ApiClient,
  opts: {
    granted?: Parameters<typeof WithPermissions>[0]['granted']
    userId?: string
    search?: Record<string, unknown>
    /** Adds a "Simulate back" button that replaces the URL state. */
    back?: Record<string, unknown>
    queryClient?: QueryClient
  } = {}
) {
  // The detail sheet renders a router <Link>, so the page sits in a router.
  const Page = () => (
    <AppsProvider api={client}>
      <RegisterAppButton />
      <TableWithUrlState initial={opts.search ?? {}} back={opts.back} />
      <AppsDialogs />
    </AppsProvider>
  )
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: Page }),
      createRoute({
        getParentRoute: () => root,
        path: '/roles',
        component: () => null,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const tree = (
    <QueryClientProvider client={opts.queryClient ?? testQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return render(
    opts.granted || opts.userId ? (
      <WithPermissions
        granted={opts.granted ?? ADMIN_PERMISSIONS}
        userId={opts.userId}
      >
        {tree}
      </WithPermissions>
    ) : (
      tree
    )
  )
}

const path = (req: Request) => new URL(req.url).pathname
export const isList = (r: Request) =>
  r.method === 'GET' && path(r) === '/api/v1/apps'
export const writes = (seen: Request[], method: string) =>
  seen.filter((r) => r.method === method)

/**
 * Fake `fetch` handler: GETs answer from the fixtures (`apps()` is read per
 * request so a test can change what the refetch returns); any other method
 * goes to `write`.
 */
export function appsServer(
  write: (req: Request) => Response | Promise<Response>,
  apps: () => typeof APPS = () => APPS
) {
  return (req: Request) => {
    if (req.method !== 'GET') return write(req)
    const p = path(req)
    if (p === '/api/v1/apps') return json(appsPage(apps()))
    const m =
      /^\/api\/v1\/apps\/([^/]+)(\/permissions|\/credentials|\/join-requests|\/role-definitions)?$/.exec(
        p
      )
    const app = apps().find((a) => a.key === m?.[1])
    if (!m || !app) return apiError(404, 'not_found')
    if (m[2] === '/join-requests') {
      if (app.key === 'admin') return apiError(404, 'not_found')
      const status = new URL(req.url).searchParams.get('status') ?? 'pending'
      return json(
        joinRequestsPage(JOIN_REQUESTS.filter((r) => r.status === status))
      )
    }
    if (m[2] === '/role-definitions') {
      const q = new URL(req.url).searchParams
      const limit = Number(q.get('limit') ?? 100)
      const offset = Number(q.get('offset') ?? 0)
      const all = ROLE_DEFINITIONS[app.key] ?? []
      return json(
        roleDefinitionsPage(
          all.slice(offset, offset + limit),
          all.length,
          limit,
          offset
        )
      )
    }
    if (m[2] === '/credentials')
      return json(credentialsPage(CREDENTIALS[app.key] ?? []))
    return m[2] ? json(permissionsPage(PERMISSIONS[app.key] ?? [])) : json(app)
  }
}
