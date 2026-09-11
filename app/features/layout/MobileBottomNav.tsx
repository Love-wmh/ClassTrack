import { NavLink } from 'react-router'
import { cn } from '~/lib/utils'
import { useMobileNavigationStore } from '~/store/mobileNavigationStore'
import { getOrderedNavigationItems } from './navigation'

export default function MobileBottomNav() {
  const order = useMobileNavigationStore((state) => state.order)
  const items = getOrderedNavigationItems(order)

  return (
    <nav
      aria-label="移动端主导航"
      className="relative z-40 w-full shrink-0 border-t border-sidebar-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="no-scrollbar flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {items.map(({ id, to, icon: Icon, label }) => (
          <NavLink
            key={id}
            to={to}
            end
            className={({ isActive }) =>
              cn(
                'flex h-16 w-1/4 min-w-1/4 flex-none snap-start flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring',
                isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground active:bg-sidebar-accent/70'
              )
            }
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
