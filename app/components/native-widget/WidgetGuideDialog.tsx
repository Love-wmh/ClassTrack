import { CalendarPlus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { isNativeWidgetSnapshotAvailable } from '~/lib/native-widget-snapshot'
import { hasSeenProfileGuide, markProfileGuideSeen, shouldShowProfileGuide } from '~/lib/profile-guide'
import {
  WIDGET_GUIDE_DESCRIPTION,
  WIDGET_GUIDE_PRIMARY_ACTION,
  WIDGET_GUIDE_SECONDARY_ACTION,
  WIDGET_GUIDE_TITLE,
  widgetGuideSteps,
} from '~/lib/widget-guide'
import { useClassStore } from '~/store'

type WidgetGuideBodyProps = {
  onPrimary: () => void
  onSecondary: () => void
}

/**
 * 引导弹窗的**内容**（标题 / 说明 / 步骤 / 两个按钮），不含 Dialog 外壳。
 *
 * 单独导出是为了可测：Radix 的 `Dialog` 内容走 Portal，`renderToStaticMarkup` 渲染不出内容，
 * 而仓库的组件测试正是用静态渲染做的（见 `ImportMethodList.test.ts`）。
 */
export function WidgetGuideBody({ onPrimary, onSecondary }: WidgetGuideBodyProps) {
  const steps = widgetGuideSteps()

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarPlus className="size-5 text-primary" />
          {WIDGET_GUIDE_TITLE}
        </DialogTitle>
        <DialogDescription>{WIDGET_GUIDE_DESCRIPTION}</DialogDescription>
      </DialogHeader>

      <ol className="list-decimal space-y-1 rounded-md border bg-muted/30 p-4 pl-8 text-sm leading-6 text-muted-foreground">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <DialogFooter className="gap-2 sm:justify-end">
        <Button variant="outline" onClick={onSecondary}>
          {WIDGET_GUIDE_SECONDARY_ACTION}
        </Button>
        <Button onClick={onPrimary}>{WIDGET_GUIDE_PRIMARY_ACTION}</Button>
      </DialogFooter>
    </>
  )
}

/**
 * 导入成功后的**一次性**加桌引导（挂载点在 `root.tsx` 的非 native-shell Layout 里）。
 *
 * 为什么不挂在 `ImportDialog` 里：导入成功时 `showImportDialog=false` 会把它整棵卸载，
 * 引导跟着一起消失。
 *
 * **不在安卓原生时返回 `null`**：浏览器 / PWA / iOS 上没有桌面小工具，弹出来是指向不存在功能的空话。
 * 判定沿用 `isNativeWidgetSnapshotAvailable()`（它同时看平台与插件注册，别自己写 `isPlatform`）。
 *
 * 「去添加」直达课表页并打开顶栏那个面板：面板本体只有一份（`WidgetPinEntry`），
 * 这里只翻它的开关，不复制 pin 状态机。
 */
export default function WidgetGuideDialog() {
  const navigate = useNavigate()
  const showWidgetGuide = useClassStore((state) => state.showWidgetGuide)
  const setShowWidgetGuide = useClassStore((state) => state.setShowWidgetGuide)
  const setWidgetPinSheetOpen = useClassStore((state) => state.setWidgetPinSheetOpen)
  const setShowProfileGuide = useClassStore((state) => state.setShowProfileGuide)

  if (!isNativeWidgetSnapshotAvailable()) return null

  /**
   * 关闭第一段引导，并顺手安排第二段（去个人中心看看）。
   *
   * <p>两个按钮都走这里：用户口径是「第一段一关就接第二段」，与有没有真的加上卡片无关。
   * 标记在**决定要弹的那一刻**写（而不是第二段被关掉时），中途被杀也不会再打扰一次。
   *
   * <p>点「去添加」时加桌面板会随即打开，第二段由 `ProfileGuideDialog` 自己等面板关掉再出现 ——
   * 所以这里只管把开关立起来。
   */
  const close = () => {
    setShowWidgetGuide(false)

    // 这个组件在非安卓原生时已经返回 null，因此这里「有小工具」恒为真。
    const shouldShowProfile = shouldShowProfileGuide({ nativeWidgetAvailable: true, seen: hasSeenProfileGuide() })
    if (!shouldShowProfile) return

    markProfileGuideSeen()
    setShowProfileGuide(true)
  }

  return (
    <Dialog open={showWidgetGuide} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-w-md" data-guide="widget">
        <WidgetGuideBody
          onSecondary={close}
          onPrimary={() => {
            close()
            navigate('/')
            setWidgetPinSheetOpen(true)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
