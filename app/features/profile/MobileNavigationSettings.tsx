import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { getOrderedNavigationItems } from '~/features/layout/navigation'
import { useMobileNavigationStore } from '~/store/mobileNavigationStore'

export default function MobileNavigationSettings() {
  const order = useMobileNavigationStore((state) => state.order)
  const moveItem = useMobileNavigationStore((state) => state.moveItem)
  const resetOrder = useMobileNavigationStore((state) => state.resetOrder)
  const items = getOrderedNavigationItems(order)

  return (
    <Card id="card-mobile-navigation">
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle>底部导航排序</CardTitle>
          <CardDescription>移动端默认显示前四项，左右滑动可查看其他入口。</CardDescription>
        </div>
        <Button className="min-h-10 self-start" type="button" variant="outline" size="sm" onClick={resetOrder}>
          <RotateCcw aria-hidden="true" />
          恢复默认
        </Button>
      </CardHeader>
      <CardContent>
        <ol className="divide-y rounded-md border">
          {items.map(({ id, icon: Icon, label }, index) => (
            <li key={id} className="flex min-h-16 items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3">
              <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
              <span className="hidden text-xs text-muted-foreground min-[360px]:inline">第 {index + 1} 项</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  aria-label={`上移${label}`}
                  onClick={() => moveItem(id, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === items.length - 1}
                  aria-label={`下移${label}`}
                  onClick={() => moveItem(id, 1)}
                >
                  <ArrowDown />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
