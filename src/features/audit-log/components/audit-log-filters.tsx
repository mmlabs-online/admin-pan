import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import { Cross2Icon } from '@radix-ui/react-icons'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import {
  actionOptions,
  actorKindOptions,
  APP_KEY_PATTERN,
  outcomeOptions,
  targetTypeOptions,
} from '../data/data'
import { type AuditLogSearch } from '../data/search'
import {
  formatDay,
  isRangeInverted,
  localZoneLabel,
  parseDay,
} from '../lib/format'

type Props = {
  search: Partial<AuditLogSearch>
  navigate: NavigateFn
}

const ANY = 'any'
const RANGE_ERROR = 'Start date must be on or before the end date.'
const isUuid = (v: string) => z.guid().safeParse(v).success

export function AuditLogFilters({ search, navigate }: Props) {
  // Bumped by Reset so the text inputs drop any invalid text they still hold.
  const [resetCount, setResetCount] = useState(0)
  const rangeErrorId = useId()
  const inverted = isRangeInverted(search.from, search.to)

  // Every filter change goes back to page 1.
  const setFilter = (key: keyof AuditLogSearch, value: string | undefined) =>
    navigate({
      search: (prev) => ({ ...prev, page: undefined, [key]: value }),
    })

  const isFiltered = (
    [
      'action',
      'targetType',
      'actorKind',
      'outcome',
      'app',
      'actor',
      'target',
      'from',
      'to',
    ] as const
  ).some((k) => search[k] !== undefined)

  const reset = () => {
    setResetCount((n) => n + 1)
    navigate({
      search: (prev) => ({
        ...prev,
        page: undefined,
        action: undefined,
        targetType: undefined,
        actorKind: undefined,
        outcome: undefined,
        app: undefined,
        actor: undefined,
        target: undefined,
        from: undefined,
        to: undefined,
      }),
    })
  }

  return (
    <div
      role='search'
      aria-label='Filter audit log'
      className='flex flex-wrap items-start gap-3'
    >
      <EnumFilter
        label='Action'
        value={search.action}
        options={actionOptions}
        onChange={(v) => setFilter('action', v)}
      />
      <EnumFilter
        label='Target type'
        value={search.targetType}
        options={targetTypeOptions}
        onChange={(v) => setFilter('targetType', v)}
      />
      <EnumFilter
        label='Actor kind'
        value={search.actorKind}
        options={actorKindOptions}
        onChange={(v) => setFilter('actorKind', v)}
      />
      <EnumFilter
        label='Outcome'
        value={search.outcome}
        options={outcomeOptions}
        onChange={(v) => setFilter('outcome', v)}
      />
      <TextFilter
        key={`app-${resetCount}`}
        label='App key'
        value={search.app}
        valid={(v) => APP_KEY_PATTERN.test(v)}
        error='Use a lowercase app key such as "admin".'
        onCommit={(v) => setFilter('app', v)}
      />
      <TextFilter
        key={`actor-${resetCount}`}
        label='Actor user ID'
        value={search.actor}
        valid={isUuid}
        error='Enter a user ID (UUID).'
        onCommit={(v) => setFilter('actor', v)}
      />
      <TextFilter
        key={`target-${resetCount}`}
        label='Target ID'
        value={search.target}
        valid={isUuid}
        error='Enter a target ID (UUID).'
        onCommit={(v) => setFilter('target', v)}
      />
      <div className='flex flex-col gap-1'>
        <div className='flex flex-wrap items-end gap-2'>
          <DateFilter
            label='From'
            value={search.from}
            describedBy={inverted ? rangeErrorId : undefined}
            onChange={(d) => setFilter('from', d && formatDay(d))}
          />
          <DateFilter
            label='To'
            value={search.to}
            describedBy={inverted ? rangeErrorId : undefined}
            onChange={(d) => setFilter('to', d && formatDay(d))}
          />
        </div>
        <p className='text-xs text-muted-foreground'>
          Dates use your time zone: {localZoneLabel()}. The end date is
          included.
        </p>
        {inverted && (
          <p
            id={rangeErrorId}
            role='alert'
            className='text-xs text-destructive'
          >
            {RANGE_ERROR}
          </p>
        )}
      </div>
      {isFiltered && (
        <Button
          variant='ghost'
          onClick={reset}
          className='mt-5 h-8 px-2 lg:px-3'
        >
          Reset
          <Cross2Icon className='ms-2 h-4 w-4' aria-hidden='true' />
        </Button>
      )}
    </div>
  )
}

function EnumFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: { label: string; value: string }[]
  onChange: (value: string | undefined) => void
}) {
  const id = useId()
  return (
    <div className='flex flex-col gap-1'>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Select
        value={value ?? ANY}
        onValueChange={(v) => onChange(v === ANY ? undefined : v)}
      >
        <SelectTrigger id={id} size='sm' className='w-48'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Keeps typed text locally and commits it to the URL 300 ms after the last
 * keystroke, only when it is empty or valid. Invalid text is never sent.
 */
function TextFilter({
  label,
  value,
  valid,
  error,
  onCommit,
}: {
  label: string
  value: string | undefined
  valid: (text: string) => boolean
  error: string
  onCommit: (value: string | undefined) => void
}) {
  const id = useId()
  const errorId = `${id}-error`
  const [text, setText] = useState(value ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const invalid = text !== '' && !valid(text)

  // Follow external URL changes (deep link, Reset) by adjusting state while rendering.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(value ?? '')
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className='flex flex-col gap-1'>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Input
        id={id}
        value={text}
        autoComplete='off'
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className='h-8 w-72'
        onChange={(e) => {
          const next = e.target.value.trim()
          setText(next)
          clearTimeout(timer.current)
          if (next === '' || valid(next)) {
            timer.current = setTimeout(() => onCommit(next || undefined), 300)
          }
        }}
      />
      {invalid && (
        <p id={errorId} className='text-xs text-destructive'>
          {error}
        </p>
      )}
    </div>
  )
}

function DateFilter({
  label,
  value,
  describedBy,
  onChange,
}: {
  label: string
  value: string | undefined
  describedBy: string | undefined
  onChange: (date: Date | undefined) => void
}) {
  const labelId = `audit-date-${label.toLowerCase()}`
  return (
    <div
      role='group'
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className='flex flex-col gap-1'
    >
      <span id={labelId} className='text-xs font-medium'>
        {label} date
      </span>
      <div className='flex items-center gap-1 [&>button]:h-8 [&>button:first-child]:w-40'>
        <DatePicker
          selected={parseDay(value)}
          onSelect={onChange}
          placeholder={`${label} date`}
        />
        {value && (
          <Button
            variant='ghost'
            size='icon'
            className='size-8'
            aria-label={`Clear ${label.toLowerCase()} date`}
            onClick={() => onChange(undefined)}
          >
            <Cross2Icon aria-hidden='true' />
          </Button>
        )}
      </div>
    </div>
  )
}
