import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/data-table/filter-select'
import { ListSearchInput } from '@/components/data-table/list-search-input'
import { organizationStatuses } from '../data/data'
import { type OrganizationStatus } from '../data/schema'

type OrganizationsToolbarProps = {
  q?: string
  status?: OrganizationStatus
  /** Any filter or a non-default sort is set. */
  canReset: boolean
  onQ: (q: string | undefined) => void
  onStatus: (status: OrganizationStatus | undefined) => void
  onReset: () => void
}

export function OrganizationsToolbar({
  q,
  status,
  canReset,
  onQ,
  onStatus,
  onReset,
}: OrganizationsToolbarProps) {
  return (
    <div
      role='search'
      aria-label='Filter organizations'
      className='flex flex-wrap items-end gap-3'
    >
      <ListSearchInput
        label='Search organizations'
        placeholder='Name or slug'
        value={q}
        onCommit={onQ}
      />
      <FilterSelect
        label='Status'
        allLabel='All statuses'
        options={organizationStatuses}
        value={status}
        onChange={onStatus}
      />
      {canReset && (
        <Button variant='outline' onClick={onReset}>
          Reset filters
        </Button>
      )}
    </div>
  )
}
