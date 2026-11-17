/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { render } from 'vitest-browser-react'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { RegisterAppButton } from '../index'
import { AppsDialogs } from './apps-dialogs'
import { AppsProvider } from './apps-provider'
import { AppsTable } from './apps-table'
import { APPS, PERMISSIONS, appsPage, permissionsPage } from './test-data'

function TableWithUrlState({ initial }: { initial: Record<string, unknown> }) {
  const [search, setSearch] = useState<Record<string, unknown>>(initial)
  const navigate: NavigateFn = ({ search: next }) => {
    if (next === true) return
    setSearch((prev) => (typeof next === 'function' ? next(prev) : next))
  }
  return (
    <>
      <code data-testid='search'>{JSON.stringify(search)}</code>
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
    search?: Record<string, unknown>
  } = {}
) {
  const tree = (
    <QueryClientProvider client={testQueryClient()}>
      <AppsProvider api={client}>
        <RegisterAppButton />
        <TableWithUrlState initial={opts.search ?? {}} />
        <AppsDialogs />
      </AppsProvider>
    </QueryClientProvider>
  )
  return render(
    opts.granted ? (
      <WithPermissions granted={opts.granted}>{tree}</WithPermissions>
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
    const m = /^\/api\/v1\/apps\/([^/]+)(\/permissions)?$/.exec(p)
    const app = apps().find((a) => a.key === m?.[1])
    if (!m || !app) return apiError(404, 'not_found')
    return m[2] ? json(permissionsPage(PERMISSIONS[app.key] ?? [])) : json(app)
  }
}
