import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/data-table/filter-select'
import { ListSearchInput } from '@/components/data-table/list-search-input'
import {
  type AppStatus,
  type JoinPolicy,
  type OrgMode,
} from '../data/app-schema'
import {
  appStatusLabels,
  joinPolicyOptions,
  orgModeOptions,
} from '../data/data'

const appStatusOptions = (Object.keys(appStatusLabels) as AppStatus[]).map(
  (value) => ({ value, label: appStatusLabels[value] })
)

type AppsToolbarProps = {
  q?: string
  status?: AppStatus
  join_policy?: JoinPolicy
  org_mode?: OrgMode
  /** Any filter or a non-default sort is set. */
  canReset: boolean
  onQ: (q: string | undefined) => void
  onStatus: (status: AppStatus | undefined) => void
  onJoinPolicy: (value: JoinPolicy | undefined) => void
  onOrgMode: (value: OrgMode | undefined) => void
  onReset: () => void
}

export function AppsToolbar({
  q,
  status,
  join_policy,
  org_mode,
  canReset,
  onQ,
  onStatus,
  onJoinPolicy,
  onOrgMode,
  onReset,
}: AppsToolbarProps) {
  return (
    <div
      role='search'
      aria-label='Filter apps'
      className='flex flex-wrap items-end gap-3'
    >
      <ListSearchInput
        label='Search apps'
        placeholder='Key or name'
        value={q}
        onCommit={onQ}
      />
      <FilterSelect
        label='Status'
        allLabel='All statuses'
        options={appStatusOptions}
        value={status}
        onChange={onStatus}
      />
      <FilterSelect
        label='Join policy'
        allLabel='All policies'
        options={joinPolicyOptions}
        value={join_policy}
        onChange={onJoinPolicy}
      />
      <FilterSelect
        label='Org mode'
        allLabel='All modes'
        options={orgModeOptions}
        value={org_mode}
        onChange={onOrgMode}
      />
      {canReset && (
        <Button variant='outline' onClick={onReset}>
          Reset filters
        </Button>
      )}
    </div>
  )
}
