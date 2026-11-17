/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { render } from 'vitest-browser-react'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { type Organization } from '../data/schema'
import { OrganizationsDialogs } from './organizations-dialogs'
import { OrganizationsPrimaryButtons } from './organizations-primary-buttons'
import {
  OrganizationsProvider,
  useOrganizations,
} from './organizations-provider'
import { OrganizationsTable } from './organizations-table'
import {
  ENTITLEMENTS,
  ORGS,
  PICKER_APPS,
  entitlementsPage,
  orgsPage,
} from './test-data'

function TableWithUrlState({ initial }: { initial: Record<string, unknown> }) {
  const [search, setSearch] = useState<Record<string, unknown>>(initial)
  const navigate: NavigateFn = ({ search: next }) => {
    if (next === true) return
    setSearch((prev) => (typeof next === 'function' ? next(prev) : next))
  }
  return (
    <>
      <code data-testid='search'>{JSON.stringify(search)}</code>
      <OrganizationsTable search={search} navigate={navigate} />
    </>
  )
}

/**
 * Page without router/header: provider + primary button + table + dialogs on
 * an injected API client. Everything is granted unless `granted` is given.
 */
export function renderOrganizations(
  client: ApiClient,
  opts: {
    granted?: Parameters<typeof WithPermissions>[0]['granted']
    search?: Record<string, unknown>
  } = {}
) {
  const tree = (
    <QueryClientProvider client={testQueryClient()}>
      <OrganizationsProvider api={client}>
        <OrganizationsPrimaryButtons />
        <TableWithUrlState initial={opts.search ?? {}} />
        <OrganizationsDialogs />
      </OrganizationsProvider>
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

function OpenSheet({ org }: { org: Organization }) {
  const { setCurrentRow, setOpen } = useOrganizations()
  // `setOpen` toggles and is not stable, so open exactly once.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    setCurrentRow(org)
    setOpen('view')
  })
  return <OrganizationsDialogs />
}

/**
 * The detail sheet open on `org`, without the table. Everything is granted
 * unless `granted` is given.
 */
export function renderOrgSheet(
  client: ApiClient,
  opts: {
    org?: Organization
    granted?: Parameters<typeof WithPermissions>[0]['granted']
    queryClient?: QueryClient
  } = {}
) {
  const tree = (
    <QueryClientProvider client={opts.queryClient ?? testQueryClient()}>
      <OrganizationsProvider api={client}>
        <OpenSheet org={opts.org ?? ORGS[0]} />
      </OrganizationsProvider>
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
export const writes = (seen: Request[], method: string) =>
  seen.filter((r) => r.method === method)
export const entitlementCalls = (seen: Request[], orgId: string) =>
  seen.filter(
    (r) =>
      r.method === 'GET' &&
      path(r) === `/api/v1/organizations/${orgId}/entitlements`
  )

/**
 * Fake `fetch` handler: GETs answer from the fixtures (`entitlements()` and
 * `apps()` are read per request, so a test can change what the refetch
 * returns); any other method goes to `write`.
 */
export function orgsServer(
  write: (req: Request) => Response | Promise<Response>,
  opts: {
    entitlements?: (orgId: string) => (typeof ENTITLEMENTS)[string]
    apps?: () => typeof PICKER_APPS
  } = {}
) {
  return (req: Request) => {
    if (req.method !== 'GET') return write(req)
    const p = path(req)
    if (p === '/api/v1/organizations') return json(orgsPage())
    if (p === '/api/v1/apps') {
      const items = (opts.apps ?? (() => PICKER_APPS))()
      return json({ items, total: items.length, limit: 100, offset: 0 })
    }
    const m = /^\/api\/v1\/organizations\/([^/]+)(\/entitlements)?$/.exec(p)
    const org = ORGS.find((o) => o.id === m?.[1])
    if (!m || !org) return apiError(404, 'not_found')
    if (!m[2]) return json(org)
    return json(
      entitlementsPage(
        (opts.entitlements ?? ((id) => ENTITLEMENTS[id] ?? []))(org.id)
      )
    )
  }
}
