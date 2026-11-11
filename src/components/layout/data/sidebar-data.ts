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
import { type SidebarData } from '../types'

// Mock staff profile until sign-in is wired to @mmlabs/auth-client (PAN-010).
export const sidebarData: SidebarData = {
  user: {
    name: 'Admin (mock)',
    email: 'admin@mmlabs.online',
    avatar: '',
  },
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
        { title: 'Dashboard', url: '/', icon: LayoutDashboard },
        { title: 'Reports', url: '/reports', icon: FileBarChart },
      ],
    },
    {
      title: 'Identity & access',
      items: [
        { title: 'Users', url: '/users', icon: Users },
        { title: 'Organizations', url: '/organizations', icon: Building2 },
        { title: 'Apps', url: '/apps', icon: Package },
        { title: 'Roles', url: '/roles', icon: KeyRound },
      ],
    },
    {
      title: 'Governance',
      items: [{ title: 'Audit log', url: '/audit-log', icon: ScrollText }],
    },
    {
      title: 'Other',
      items: [
        {
          title: 'Settings',
          icon: Settings,
          items: [
            { title: 'Profile', url: '/settings', icon: UserCog },
            { title: 'Account', url: '/settings/account', icon: Wrench },
            { title: 'Appearance', url: '/settings/appearance', icon: Palette },
            { title: 'Display', url: '/settings/display', icon: Monitor },
          ],
        },
      ],
    },
  ],
}
