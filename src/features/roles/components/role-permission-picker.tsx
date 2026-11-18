import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ADMIN_APP_KEY, type Permission } from '@/features/apps/data/app-schema'
import { permissionScopeLabels } from '@/features/apps/data/data'
import {
  PERMISSION_KEYS_MAX,
  SUPER_ADMIN_ROLE_KEY,
  WILDCARD,
} from '../data/role-schema'

type RolePermissionPickerProps = {
  appKey: string
  /** The role being edited; absent when creating. */
  roleKey?: string
  /** Every permission of the app (all pages). */
  permissions: Permission[]
  /** Keys, not ids: the PUT takes keys. */
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  disabled?: boolean
}

// Selection is a set of keys. Keys the role holds but the app list lacks are
// listed first and kept unless unchecked: the PUT is a full replace, so
// dropping them silently would remove access.
export function RolePermissionPicker({
  appKey,
  roleKey,
  permissions,
  selected,
  onChange,
  disabled,
}: RolePermissionPickerProps) {
  const id = useId()
  const known = new Set(permissions.map((p) => p.key))
  const unknown = [...selected].filter((k) => !known.has(k)).sort()
  const groups = (['app', 'org'] as const).map((scope) => ({
    scope,
    items: permissions
      .filter((p) => p.scope === scope)
      .sort((a, b) => a.key.localeCompare(b.key)),
  }))

  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(key)
    else next.delete(key)
    onChange(next)
  }

  const row = (
    key: string,
    opts: { description?: string | null; hint?: string; locked?: boolean }
  ) => {
    const rowId = `${id}-${key}`
    const noteId = `${rowId}-note`
    const hasNote = Boolean(opts.description || opts.hint)
    return (
      <li key={key} className='flex items-start gap-2'>
        <Checkbox
          id={rowId}
          checked={selected.has(key)}
          disabled={disabled || opts.locked}
          aria-describedby={hasNote ? noteId : undefined}
          onCheckedChange={(v) => toggle(key, v === true)}
          className='mt-0.5'
        />
        <div className='min-w-0'>
          <Label htmlFor={rowId} className='font-mono text-sm font-normal'>
            {key}
          </Label>
          {hasNote && (
            <p id={noteId} className='text-xs text-muted-foreground'>
              {[opts.description, opts.hint].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </li>
    )
  }

  return (
    <fieldset className='space-y-2'>
      <legend className='text-sm font-medium'>Permissions</legend>
      <p className='text-sm text-muted-foreground'>
        The role gets exactly the checked permissions (the list replaces the
        role&apos;s current set).
      </p>
      <div className='max-h-72 space-y-3 overflow-y-auto rounded-md border p-3'>
        {unknown.length > 0 && (
          <section aria-label="Not in this app's permission list">
            <h4 className='mb-1 text-xs font-medium text-muted-foreground'>
              Not in this app&apos;s permission list
            </h4>
            <ul className='space-y-2'>
              {unknown.map((k) =>
                row(k, { hint: 'The role holds this, the app list lacks it' })
              )}
            </ul>
          </section>
        )}
        {groups.map(
          ({ scope, items }) =>
            items.length > 0 && (
              <section
                key={scope}
                aria-label={`${permissionScopeLabels[scope]} permissions`}
              >
                <h4 className='mb-1 text-xs font-medium text-muted-foreground'>
                  {permissionScopeLabels[scope]}
                </h4>
                <ul className='space-y-2'>
                  {items.map((p) => {
                    const wildcardLocked =
                      appKey === ADMIN_APP_KEY &&
                      p.key === WILDCARD &&
                      roleKey !== SUPER_ADMIN_ROLE_KEY
                    return row(p.key, {
                      description: p.description,
                      hint: wildcardLocked
                        ? 'Only admin:super-admin can hold admin:*'
                        : p.is_admin
                          ? 'Admin only — changing it needs admin:*'
                          : undefined,
                      // Never lock a key the role already holds: that would trap it.
                      locked: wildcardLocked && !selected.has(p.key),
                    })
                  })}
                </ul>
              </section>
            )
        )}
        {permissions.length === 0 && unknown.length === 0 && (
          <p className='text-sm text-muted-foreground'>
            This app has no permissions yet.
          </p>
        )}
      </div>
      {selected.size > PERMISSION_KEYS_MAX && (
        <p role='alert' className='text-sm text-destructive'>
          A role can hold at most {PERMISSION_KEYS_MAX} permissions.
        </p>
      )}
    </fieldset>
  )
}
