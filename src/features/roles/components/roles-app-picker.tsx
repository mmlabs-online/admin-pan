import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type App } from '@/features/apps/data/app-schema'

type RolesAppPickerProps = {
  apps: App[]
  total: number
  /** The selected app, even when it is not in `apps` (opened by URL). */
  selected: App | null
  onChange: (key: string) => void
}

export function RolesAppPicker({
  apps,
  total,
  selected,
  onChange,
}: RolesAppPickerProps) {
  const options =
    selected && !apps.some((a) => a.key === selected.key)
      ? [...apps, selected]
      : apps
  return (
    <div className='space-y-1'>
      <Label htmlFor='roles-app'>App</Label>
      <Select value={selected?.key ?? ''} onValueChange={onChange}>
        <SelectTrigger id='roles-app' className='w-full sm:w-72'>
          <SelectValue placeholder='Choose an app' />
        </SelectTrigger>
        <SelectContent>
          {options.map((a) => (
            <SelectItem key={a.key} value={a.key}>
              {a.name} ({a.key}){a.status === 'disabled' ? ' — disabled' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {total > apps.length && (
        <p className='text-sm text-muted-foreground'>
          Showing the first {apps.length} apps; open others from the Apps
          screen.
        </p>
      )}
    </div>
  )
}
