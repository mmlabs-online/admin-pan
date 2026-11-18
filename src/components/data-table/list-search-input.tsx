import { useEffect, useId, useRef, useState } from 'react'
import { SEARCH_DEBOUNCE_MS, SEARCH_MAX, toSearchTerm } from '@/lib/list-search'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ListSearchInputProps = {
  label: string
  placeholder?: string
  /** The committed term (from the URL). */
  value?: string
  onCommit: (value: string | undefined) => void
  inputRef?: React.Ref<HTMLInputElement>
  /** Marks the input invalid (the server rejected the search). */
  invalid?: boolean
  describedBy?: string
}

/**
 * Debounced search box. The draft follows `value` when it changes from outside
 * (back/forward, reset); a stale debounced draft never overwrites that.
 */
export function ListSearchInput({
  label,
  placeholder,
  value,
  onCommit,
  inputRef,
  invalid,
  describedBy,
}: ListSearchInputProps) {
  const id = useId()
  const [draft, setDraft] = useState(value ?? '')
  const dirty = useRef(false)
  const committed = useRef(value)
  const debounced = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS)

  useEffect(() => {
    if (!dirty.current) return
    dirty.current = false
    const term = toSearchTerm(debounced)
    if (term === value) return
    committed.current = term
    onCommit(term)
    // Only a new debounced draft commits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  useEffect(() => {
    if (value === committed.current) return
    committed.current = value
    dirty.current = false
    setDraft(value ?? '')
  }, [value])

  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={inputRef}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        type='search'
        className='w-full sm:w-64'
        maxLength={SEARCH_MAX}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => {
          dirty.current = true
          setDraft(e.target.value)
        }}
      />
    </div>
  )
}
