/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { render } from 'vitest-browser-react'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { OrganizationsDialogs } from './organizations-dialogs'
import { OrganizationsPrimaryButtons } from './organizations-primary-buttons'
import { OrganizationsProvider } from './organizations-provider'
import { OrganizationsTable } from './organizations-table'

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
