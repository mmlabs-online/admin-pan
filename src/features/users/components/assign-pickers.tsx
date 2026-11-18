import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type ApiClient, type components } from '@/api'
import { queryView } from '@/lib/query-view'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { orgPickerQueryOptions, userPickerQueryOptions } from '../api/queries'
import { userLabel } from '../data/data'
import { type User } from '../data/schema'
import { UserStatusBadge } from './user-status-badge'

type Organization = components['schemas']['OrganizationRead']
type Results<T> = { items: T[]; total: number }

type PickListProps<T extends { id: string }> = {
  label: string
  /** Plural noun for the empty state. */
  noun: string
  maxLength?: number
  /** The submitted term (null until a search, cleared when the text changes). */
  term: string | null
  onTerm: (term: string | null) => void
  query: {
    data: Results<T> | undefined
    error: unknown
    isPending: boolean
    refetch: () => unknown
  }
  selected: T | null
  onSelect: (row: T | null) => void
  describe: (row: T) => React.ReactNode
  /** The chosen row as one line; defaults to `describe`. */
  summary?: (row: T) => React.ReactNode
  /** Visible reason this picker can't be used (permission denied). */
  unavailable?: string
}

// Explicit selection (appsec F1): a search never picks anything. Results show
// only for the submitted term; typing clears the term and the selection, so a
// slow response for an old term can't be shown or chosen.
function PickList<T extends { id: string }>({
  label,
  noun,
  maxLength,
  term,
  onTerm,
  query: q,
  selected,
  onSelect,
  describe,
  summary = describe,
  unavailable,
}: PickListProps<T>) {
  const inputId = useId()
  const groupId = useId()
  const [text, setText] = useState('')
  const view = queryView(q)
  const search = () => {
    const trimmed = text.trim()
    if (trimmed) onTerm(trimmed)
  }

  return (
    <div className='space-y-2'>
      <Label htmlFor={inputId}>{label}</Label>
      <div className='flex gap-2'>
        <Input
          id={inputId}
          value={text}
          maxLength={maxLength}
          autoComplete='off'
          disabled={!!unavailable}
          onChange={(e) => {
            setText(e.target.value)
            onTerm(null)
            onSelect(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              search()
            }
          }}
        />
        <Button
          type='button'
          variant='outline'
          aria-disabled={!!unavailable || !text.trim()}
          className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
          onClick={() => {
            if (!unavailable) search()
          }}
        >
          Search
        </Button>
      </div>
      {unavailable && (
        <p className='text-sm text-muted-foreground'>{unavailable}</p>
      )}
      {selected ? (
        <p className='text-sm'>
          Selected: {summary(selected)}{' '}
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto p-0'
            onClick={() => onSelect(null)}
          >
            Change
          </Button>
        </p>
      ) : (
        term !== null &&
        !unavailable &&
        (view.status === 'forbidden' ? (
          <ForbiddenPanel variant='inline' copy={view.copy} />
        ) : view.status === 'error' ? (
          <div role='alert' className='space-y-2 text-sm'>
            <p>Couldn&apos;t search.</p>
            <Button type='button' size='sm' onClick={() => void q.refetch()}>
              Retry
            </Button>
          </div>
        ) : view.status === 'pending' ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Searching…
          </p>
        ) : view.data.items.length === 0 ? (
          <p role='status' className='text-sm text-muted-foreground'>
            No {noun} match.
          </p>
        ) : (
          <>
            <div
              role='radiogroup'
              aria-label={`Matching ${noun}`}
              id={groupId}
              className='max-h-48 divide-y overflow-y-auto rounded-md border'
            >
              {view.data.items.map((row) => (
                <label
                  key={row.id}
                  className='flex cursor-pointer items-start gap-2 px-3 py-2 text-sm'
                >
                  <input
                    type='radio'
                    name={groupId}
                    checked={false}
                    onChange={() => onSelect(row)}
                    className='mt-1'
                  />
                  <span className='flex flex-wrap items-center gap-x-2'>
                    {describe(row)}
                  </span>
                </label>
              ))}
            </div>
            {view.data.total > view.data.items.length && (
              <p role='status' className='text-sm text-muted-foreground'>
                More than {view.data.items.length} {noun} match. Refine the
                search.
              </p>
            )}
          </>
        ))
      )}
    </div>
  )
}

const describeUser = (u: User) => (
  <>
    <bdi className='font-medium'>{u.email}</bdi>
    <bdi className='text-muted-foreground'>
      {u.display_name ?? 'No display name'}
    </bdi>
    <UserStatusBadge status={u.status} />
    <code className='text-xs text-muted-foreground'>{u.id.slice(0, 8)}</code>
  </>
)

/** Find one user by email (substring search, 10 results, explicit choice). */
export function UserPicker({
  api,
  selected,
  onSelect,
  unavailable,
}: {
  api: ApiClient
  selected: User | null
  onSelect: (user: User | null) => void
  unavailable?: string
}) {
  const [term, setTerm] = useState<string | null>(null)
  const query = useQuery({
    ...userPickerQueryOptions(term ?? '', api),
    enabled: term !== null && !unavailable,
  })
  return (
    <PickList
      label='Find a user by email'
      noun='users'
      term={term}
      onTerm={setTerm}
      query={query}
      selected={selected}
      onSelect={onSelect}
      unavailable={unavailable}
      describe={describeUser}
      summary={(u) => (
        <>
          <bdi>{userLabel(u)}</bdi> (<bdi>{u.email}</bdi>)
        </>
      )}
    />
  )
}

/** Find one organization by name or slug. */
export function OrgPicker({
  api,
  selected,
  onSelect,
  unavailable,
}: {
  api: ApiClient
  selected: Organization | null
  onSelect: (org: Organization | null) => void
  unavailable?: string
}) {
  const [term, setTerm] = useState<string | null>(null)
  const query = useQuery({
    ...orgPickerQueryOptions(term ?? '', api),
    enabled: term !== null && !unavailable,
  })
  return (
    <PickList
      label='Find an organization'
      noun='organizations'
      maxLength={100}
      term={term}
      onTerm={setTerm}
      query={query}
      selected={selected}
      onSelect={onSelect}
      unavailable={unavailable}
      describe={(o) => (
        <>
          <bdi className='font-medium'>{o.name}</bdi>
          <bdi className='text-muted-foreground'>{o.slug}</bdi>
        </>
      )}
    />
  )
}
