import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  FolderTree,
  Users,
  TicketPercent,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from '@/constants/routes'

export interface AdminNavItem {
  label: string
  to: string
  icon: LucideIcon
  /** NavLink `end` — set for a route that is a prefix of its siblings
   * (e.g. "/admin" must not stay active on "/admin/orders"). */
  end?: boolean
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

/**
 * The single source of truth for admin navigation.
 *
 * Only routes that actually exist today (see App.tsx / constants/routes.ts)
 * are listed. Deliberately NOT here:
 *   - "Reviews" — there is no standalone review list/GET endpoint
 *     (backend only exposes PATCH /admin/reviews/:id/status); moderation
 *     stays per-product on the product detail page.
 *   - "Operations" — no /admin/operations route exists yet.
 * Both will be added in a later step alongside their routes, not faked now.
 *
 * Order-, category-, product- and customer-*detail* routes are reached
 * from their list pages, not the sidebar, so they aren't listed either.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Manage',
    items: [
      { label: 'Overview', to: ROUTES.ADMIN_DASHBOARD, icon: LayoutDashboard, end: true },
      { label: 'Orders', to: ROUTES.ADMIN_ORDERS, icon: ShoppingBag },
      { label: 'Products', to: ROUTES.ADMIN_PRODUCTS, icon: Package },
      { label: 'Categories', to: ROUTES.ADMIN_CATEGORIES, icon: FolderTree },
      { label: 'Customers', to: ROUTES.ADMIN_CUSTOMERS, icon: Users },
      { label: 'Coupons', to: ROUTES.ADMIN_COUPONS, icon: TicketPercent },
    ],
  },
  {
    label: 'Configure',
    items: [{ label: 'Settings', to: ROUTES.ADMIN_SETTINGS, icon: Settings }],
  },
]
