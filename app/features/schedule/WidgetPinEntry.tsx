import { CalendarPlus, Check } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '~/components/ui/sheet'
import { useWidgetPin } from './hooks/useWidgetPin'
import { WIDGET_PIN_PRESETS } from './widgetPinPresets'

/**
 * 课表页顶栏的「添加到桌面」入口。
 *
 * **只在 Android 原生渲染**：浏览器 / PWA / iOS 上不存在桌面小工具，渲染出来只会是个点了没反应的死按钮。
 * 判断沿用既有的 `isNativeWidgetSnapshotAvailable()`（它同时检查平台与插件注册，见该函数注释里那条
 * 「浏览器里 isPluginAvailable 也会返回 true」的坑）。
 *
 * 面板里的每个预设都写清「目标格子 + 长什么样 + 什么时候选它」，并**如实说明尺寸由系统决定**：
 * 我们只能请求系统去放置，最终摆放尺寸取决于 launcher。
 */
export default function WidgetPinEntry() {
  const { supported, pending, message, added, pin } = useWidgetPin()

  if (!supported) return null

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="添加到桌面"
          className="h-9 w-9 bg-card text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground"
        >
          <CalendarPlus className="size-4" />
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>添加到桌面</SheetTitle>
          <SheetDescription>
            选一种摆法，按它推荐的大小放到桌面上。放好之后样式还能随时改；格子大小以桌面实际放下为准， 可以自己拖动调整。
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid gap-3">
          {WIDGET_PIN_PRESETS.map((preset) => {
            const isPending = pending === preset.id
            const isAdded = added === preset.id
            return (
              <div key={preset.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{preset.name}</span>
                    <Badge variant="secondary" className="font-mono text-[0.7rem]">
                      {preset.cell}
                    </Badge>
                  </div>
                  <Button
                    variant={isAdded ? 'secondary' : 'default'}
                    size="sm"
                    disabled={pending !== null}
                    onClick={() => void pin(preset.id)}
                    className="shrink-0"
                  >
                    {isAdded ? <Check className="size-3.5" /> : null}
                    {isPending ? '正在添加…' : isAdded ? '已添加' : '添加到桌面'}
                  </Button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{preset.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">适合：{preset.hint}</p>
              </div>
            )
          })}
        </div>

        {message ? (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
