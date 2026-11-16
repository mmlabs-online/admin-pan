import { useMemo } from 'react'
import { type Requirement } from '@/lib/permissions/registry'
import { evaluate, type PermissionState } from '@/lib/permissions/source'
import { usePermissionSource } from '@/context/permission-provider'
import { sidebarData } from './data/sidebar-data'
import { type NavGroup, type NavItem } from './types'

export function filterNavGroups(
  groups: NavGroup[],
  check: (requirement: Requirement) => PermissionState
): NavGroup[] {
  const visible = (r: Requirement) => check(r) !== 'denied'
  return groups
    .map((group) => ({
      ...group,
      items: group.items.flatMap((item): NavItem[] => {
        if (item.items) {
          const items = item.items.filter((sub) => visible(sub.permission))
          return items.length > 0 ? [{ ...item, items }] : []
        }
        return visible(item.permission) ? [item] : []
      }),
    }))
    .filter((group) => group.items.length > 0)
}

export function useVisibleNavGroups(): NavGroup[] {
  const source = usePermissionSource()
  return useMemo(
    () => filterNavGroups(sidebarData.navGroups, (r) => evaluate(r, source)),
    [source]
  )
}
