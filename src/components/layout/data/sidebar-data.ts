import {
  Building2,
  FileBarChart,
  KeyRound,
  LayoutDashboard,
  Monitor,
  Package,
  Palette,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react'
import { ROUTE_PERMISSIONS as RP } from '@/lib/permissions/registry'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  teams: [
    {
      name: 'mmlabs Admin',
      logo: ShieldCheck,
      plan: 'Staff console',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: LayoutDashboard,
          permission: RP['/_authenticated/'],
        },
        {
          title: 'Reports',
          url: '/reports',
          icon: FileBarChart,
          permission: RP['/_authenticated/reports/'],
        },
      ],
    },
    {
      title: 'Identity & access',
      items: [
        {
          title: 'Users',
          url: '/users',
          icon: Users,
          permission: RP['/_authenticated/users/'],
        },
        {
          title: 'Organizations',
          url: '/organizations',
          icon: Building2,
          permission: RP['/_authenticated/organizations/'],
        },
        {
          title: 'Apps',
          url: '/apps',
          icon: Package,
          permission: RP['/_authenticated/apps/'],
        },
        {
          title: 'Roles',
          url: '/roles',
          icon: KeyRound,
          permission: RP['/_authenticated/roles/'],
        },
      ],
    },
    {
      title: 'Governance',
      items: [
        {
          title: 'Audit log',
          url: '/audit-log',
          icon: ScrollText,
          permission: RP['/_authenticated/audit-log/'],
        },
      ],
    },
    {
      title: 'Other',
      items: [
        {
          title: 'Settings',
          icon: Settings,
          items: [
            {
              title: 'Profile',
              url: '/settings',
              icon: UserCog,
              permission: RP['/_authenticated/settings/'],
            },
            {
              title: 'Account',
              url: '/settings/account',
              icon: Wrench,
              permission: RP['/_authenticated/settings/account'],
            },
            {
              title: 'Appearance',
              url: '/settings/appearance',
              icon: Palette,
              permission: RP['/_authenticated/settings/appearance'],
            },
            {
              title: 'Display',
              url: '/settings/display',
              icon: Monitor,
              permission: RP['/_authenticated/settings/display'],
            },
          ],
        },
      ],
    },
  ],
}
