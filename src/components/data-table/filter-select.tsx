import { useId } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Radix Select forbids an empty item value, so "All" has a sentinel.
const ALL = 'all'

type FilterSelectProps<T extends string> = {
  label: string
  allLabel: string
  options: { label: string; value: T }[]
  value?: T
  onChange: (value: T | undefined) => void
}

/** Single-value API filter: one option or "All" (no filter). */
export function FilterSelect<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
}: FilterSelectProps<T>) {
  const id = useId()
  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => onChange(v === ALL ? undefined : (v as T))}
      >
        <SelectTrigger id={id} className='w-full sm:w-44'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
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
