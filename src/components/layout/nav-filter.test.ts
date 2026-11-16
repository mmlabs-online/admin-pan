import { fakePermissionSource } from '@/test-utils/permissions'
import { describe, expect, it } from 'vitest'
import {
  ROUTE_PERMISSIONS,
  type AuthenticatedRouteId,
} from '@/lib/permissions/registry'
import { evaluate, unknownPermissionSource } from '@/lib/permissions/source'
import { sidebarData } from './data/sidebar-data'
import { filterNavGroups } from './nav-filter'

const filterWith = (source: Parameters<typeof evaluate>[1]) =>
  filterNavGroups(sidebarData.navGroups, (r) => evaluate(r, source))

const titles = (groups: ReturnType<typeof filterWith>) =>
  groups.flatMap((g) => g.items.map((i) => i.title))

describe('filterNavGroups', () => {
  it('denied links are removed; a collapsible whose children are all denied is removed; an empty group is removed', () => {
    const groups = filterNavGroups(
      [
        {
          title: 'G',
          items: [
            {
              title: 'Users',
              url: '/users',
              permission: ROUTE_PERMISSIONS['/_authenticated/users/'],
            },
            {
              title: 'Parent',
              items: [
                {
                  title: 'Child',
                  url: '/apps',
                  permission: ROUTE_PERMISSIONS['/_authenticated/apps/'],
                },
              ],
            },
          ],
        },
      ],
      (r) => evaluate(r, fakePermissionSource([]))
    )
    expect(groups).toEqual([])
  })

  it('keeps granted links and drops only the denied ones', () => {
    const groups = filterWith(fakePermissionSource(['admin:users:read']))
    expect(titles(groups)).toContain('Users')
    expect(titles(groups)).not.toContain('Organizations')
  })

  it('unknown keeps every item; none-kind items stay under a deny-all source', () => {
    expect(titles(filterWith(unknownPermissionSource))).toEqual(
      titles(sidebarData.navGroups.map((g) => g))
    )
    const denyAll = filterWith(fakePermissionSource([]))
    expect(titles(denyAll)).toContain('Settings')
    expect(titles(denyAll)).not.toContain('Users')
    expect(titles(denyAll)).not.toContain('Apps')
    expect(
      titles(filterWith(fakePermissionSource(['admin:users:read'])))
    ).toContain('Users')
  })

  it('every nav link uses the requirement of its route', () => {
    const toId = (url: string): AuthenticatedRouteId => {
      if (url === '/') return '/_authenticated/'
      if (url.startsWith('/settings/'))
        return `/_authenticated${url}` as AuthenticatedRouteId
      return `/_authenticated${url}/` as AuthenticatedRouteId
    }
    for (const group of sidebarData.navGroups)
      for (const item of group.items)
        for (const link of item.items ?? [item])
          expect(link.permission, link.url as string).toBe(
            ROUTE_PERMISSIONS[toId(link.url as string)]
          )
  })
})
