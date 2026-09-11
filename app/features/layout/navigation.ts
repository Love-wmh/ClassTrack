import { BarChart3, Calendar, ClipboardPen, Database, NotebookTabs, User, type LucideIcon } from 'lucide-react'

export const NAV_ITEM_IDS = ['schedule', 'dashboard', 'course-management', 'substitute-management', 'data-management', 'profile'] as const

export type NavItemId = (typeof NAV_ITEM_IDS)[number]

export type NavigationItem = {
  id: NavItemId
  to: string
  icon: LucideIcon
  label: string
}

export const navigationItems: NavigationItem[] = [
  { id: 'schedule', to: '/', icon: Calendar, label: '课程表' },
  { id: 'dashboard', to: '/dashboard', icon: BarChart3, label: '数据看板' },
  { id: 'course-management', to: '/course-management', icon: NotebookTabs, label: '课程管理' },
  { id: 'substitute-management', to: '/substitute-management', icon: ClipboardPen, label: '代课管理' },
  { id: 'data-management', to: '/data-management', icon: Database, label: '数据管理' },
  { id: 'profile', to: '/profile', icon: User, label: '个人中心' },
]

export function normalizeNavigationOrder(order: NavItemId[]) {
  const validIds = new Set<NavItemId>(NAV_ITEM_IDS)
  const normalized = order.filter((id, index) => validIds.has(id) && order.indexOf(id) === index)

  return [...normalized, ...NAV_ITEM_IDS.filter((id) => !normalized.includes(id))]
}

export function getOrderedNavigationItems(order: NavItemId[]) {
  const itemMap = new Map(navigationItems.map((item) => [item.id, item]))
  return normalizeNavigationOrder(order)
    .map((id) => itemMap.get(id))
    .filter((item): item is NavigationItem => Boolean(item))
}
