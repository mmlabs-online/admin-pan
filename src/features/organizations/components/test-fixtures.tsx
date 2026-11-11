import { useState } from 'react'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { type Organization } from '../data/schema'
import { OrganizationsDialogs } from './organizations-dialogs'
import { OrganizationsPrimaryButtons } from './organizations-primary-buttons'
import {
  OrganizationsProvider,
  useOrganizations,
} from './organizations-provider'
import { OrganizationsTable } from './organizations-table'
import { MOCK_ORGS } from './test-data'

function TableWithUrlState() {
  const [search, setSearch] = useState<Record<string, unknown>>({})
  const { organizations } = useOrganizations()
  const navigate: NavigateFn = ({ search: next }) => {
    setSearch((prev) =>
      typeof next === 'function'
        ? { ...next(prev) }
        : next === true
          ? prev
          : next
    )
  }
  return (
    <OrganizationsTable
      data={organizations}
      search={search}
      navigate={navigate}
    />
  )
}

/** Page without router/header: provider + primary button + table + dialogs. */
export function OrganizationsHarness({
  data = MOCK_ORGS,
}: {
  data?: Organization[]
}) {
  return (
    <OrganizationsProvider initialData={data}>
      <OrganizationsPrimaryButtons />
      <TableWithUrlState />
      <OrganizationsDialogs />
    </OrganizationsProvider>
  )
}
