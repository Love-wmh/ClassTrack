import { NavLink } from 'react-router'
import { Triangle } from 'lucide-react'
import { useScrollEdges } from './hooks/useScrollEdges'
import { cn } from '~/lib/utils'
import { useMobileNavigationStore } from '~/store/mobileNavigationStore'
import { getOrderedNavigationItems } from './navigation'

export default function MobileBottomNav() {
  const order = useMobileNavigationStore((state) => state.order)
  const items = getOrderedNavigationItems(order)
  const { ref: navScrollRef, edges } = useScrollEdges<HTMLDivElement>()
  const showStartHint = edges === 'start' || edges === 'both'
  const showEndHint = edges === 'end' || edges === 'both'

  return (
    <nav
      aria-label="移动端主导航"
      className="relative z-40 w-full shrink-0 border-t border-sidebar-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {/*
        一屏只放得下 4 项（每项 `w-1/4`）且滚动条被隐藏，用户看不出还能横滑 —— 第 6 项「个人中心」
        就是这么被藏起来的。因此在**还有内容的那一侧**浮出一个小三角指示（判定见 `app/lib/scroll-edges.ts`），
        滚到那一侧的末端指示自动消失，不会误导成「右边还有」。
        为什么是指示而不是渐隐：shadcn 的 `scroll-fade` 是 `mask-image`，只淡内容不淡背景，底栏每项
        内容居中、边缘 40px 大半是留白 —— 2026-09-23 实测只改动 9px 宽、平均差异 0.07% 的像素；
        而把整条边带压暗的阴影又会让文字发虚。小三角两者都不占。
      */}
      <div className="relative">
        <div ref={navScrollRef} className="no-scrollbar flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
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
        {showStartHint && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0.5 flex items-center text-muted-foreground">
            <Triangle className="size-3 -rotate-90 fill-current" />
          </span>
        )}
        {showEndHint && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0.5 flex items-center text-muted-foreground">
            <Triangle className="size-3 rotate-90 fill-current" />
          </span>
        )}
      </div>
    </nav>
  )
}
