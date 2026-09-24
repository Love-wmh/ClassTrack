import { AlertTriangle, CalendarPlus, Check, ExternalLink, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '~/components/ui/sheet'
import { useWidgetPin } from './hooks/useWidgetPin'
import type { WidgetPinCapability, WidgetPresetId } from '~/lib/native-widget-snapshot'
import {
  manualSteps,
  WIDGET_PIN_OBSERVED_HINT,
  WIDGET_PIN_SIZE_TUNING_HINT,
  WIDGET_PIN_PRESETS,
  WIDGET_PIN_REQUESTING_HINT,
  WIDGET_PIN_VIVO_GALLERY_ACTION,
  WIDGET_PIN_VIVO_GALLERY_HINT,
  WIDGET_PIN_XIAOMI_PERMISSION_ACTION,
  WIDGET_PIN_XIAOMI_PERMISSION_HINT,
} from './widgetPinPresets'
import { useClassStore } from '~/store'

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
type ManualFallbackProps = {
  capability: WidgetPinCapability
  onShortcutPermission: () => Promise<void>
  onWidgetGallery: () => Promise<void>
}

/**
 * 「手动添加」区块：按厂商取的步骤 + 该厂商专属的入口。
 *
 * 抽成组件而不是写两遍：面板底部与失败态弹窗都要它，各抄一份必然漂移（这段文案本身已经改过一次）。
 *
 * **它不承诺任何事**：步骤按厂商取（四家入口名与层级都不一样），两个按钮也都只是导航 —— 跳不动就静默，
 * 面板不会因此弹错。
 */
function ManualFallback({ capability, onShortcutPermission, onWidgetGallery }: ManualFallbackProps) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-2">
      <p className="text-xs font-medium text-foreground">手动添加</p>
      <p className="mt-1 text-xs text-muted-foreground">{manualSteps(capability.family)}</p>
      {capability.shortcutHint ? (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">{WIDGET_PIN_XIAOMI_PERMISSION_HINT}</p>
          <Button variant="outline" size="sm" className="mt-1.5" onClick={() => void onShortcutPermission()}>
            <ExternalLink className="size-3.5" />
            {WIDGET_PIN_XIAOMI_PERMISSION_ACTION}
          </Button>
        </div>
      ) : null}
      {capability.galleryButton ? (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">{WIDGET_PIN_VIVO_GALLERY_HINT}</p>
          <Button variant="outline" size="sm" className="mt-1.5" onClick={() => void onWidgetGallery()}>
            <ExternalLink className="size-3.5" />
            {WIDGET_PIN_VIVO_GALLERY_ACTION}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default function WidgetPinEntry() {
  const { supported, pending, outcome, message, added, modal, dismissModal, capability, openShortcutPermission, openWidgetGallery, pin } =
    useWidgetPin()
  // 「再试一次」要知道用户上次点的是哪个预设：hook 只保留结果，不保留入参。
  const [lastPreset, setLastPreset] = useState<WidgetPresetId | null>(null)
  // 面板开合由 store 控制：导入后的引导要能「直达并自动打开」它，而面板本体只保留这一份实现。
  const sheetOpen = useClassStore((state) => state.widgetPinSheetOpen)
  const setSheetOpen = useClassStore((state) => state.setWidgetPinSheetOpen)

  if (!supported) return null

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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

        {/*
          尺寸可调这条提示与导入后的引导**共用同一份常量**（`WIDGET_PIN_SIZE_TUNING_HINT`）：
          两处各写一句必然漂移，而这里正是用户真正会去拖尺寸的地方。
        */}
        <p className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
          {WIDGET_PIN_SIZE_TUNING_HINT}
        </p>

        <div className="mt-4 grid gap-3">
          {WIDGET_PIN_PRESETS.map((preset) => {
            const isPending = pending === preset.id
            // 「等待确认」与「正在添加」是两件事：前者已受理、正等系统回调，此时绝不能给出成功暗示。
            const isWaiting = isPending && outcome === 'requesting'
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
                    onClick={() => {
                      setLastPreset(preset.id)
                      void pin(preset.id)
                    }}
                    className="shrink-0"
                  >
                    {isAdded ? <Check className="size-3.5" /> : null}
                    {isWaiting ? '等待确认…' : isPending ? '正在添加…' : isAdded ? '已添加' : '添加到桌面'}
                  </Button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{preset.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">适合：{preset.hint}</p>
              </div>
            )
          })}
        </div>

        {message ? (
          <p
            className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
            role="status"
            data-outcome={outcome}
            aria-live={outcome === 'requesting' ? 'polite' : 'assertive'}
          >
            {message}
          </p>
        ) : null}

        {/*
          手动步骤**常驻**到底部，不只在失败时出现：会静默吞掉 pin 请求的桌面上（实测 ColorOS），
          它才是唯一可靠的路径，藏起来等于让用户卡死在一个不生效的按钮上。
        */}
        <div className="mt-3">
          <ManualFallback capability={capability} onShortcutPermission={openShortcutPermission} onWidgetGallery={openWidgetGallery} />
        </div>
      </SheetContent>

      {/*
        醒目标态框：点击后**立刻**出现「正在尝试添加」，失败一判定出来就立刻切成失败态。
        用 Dialog 而不是 Sheet —— 要的是打断式的醒目提示，不是又一层可以滑走的面板。
      */}
      <Dialog open={modal !== 'hidden'} onOpenChange={(openValue) => (openValue ? undefined : dismissModal())}>
        <DialogContent className="max-w-sm" data-modal-state={modal}>
          {modal === 'requesting' ? (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                正在尝试添加…
              </DialogTitle>
              <DialogDescription>{WIDGET_PIN_REQUESTING_HINT}</DialogDescription>
            </DialogHeader>
          ) : null}

          {modal === 'added' ? (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="size-5 text-primary" />
                已添加到桌面
              </DialogTitle>
              <DialogDescription>
                {/*
                  两条「加上了」的措辞必须可区分：回调命中是系统的权威结论（不解释）；
                  复核命中只知道「桌面上多了一张卡片」，必须带限定句，绝不写成「系统已确认」。
                */}
                {outcome === 'added_observed' ? WIDGET_PIN_OBSERVED_HINT : '样式已按你选的摆法设置好，之后还能随时改。'}
              </DialogDescription>
            </DialogHeader>
          ) : null}

          {modal === 'failed' ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" />
                  没有添加成功
                </DialogTitle>
                <DialogDescription className="text-foreground">{message}</DialogDescription>
              </DialogHeader>
              <ManualFallback capability={capability} onShortcutPermission={openShortcutPermission} onWidgetGallery={openWidgetGallery} />
              <DialogFooter className="gap-2 md:justify-end">
                <Button variant="outline" onClick={dismissModal}>
                  知道了
                </Button>
                <Button
                  disabled={pending !== null}
                  onClick={() => {
                    dismissModal()
                    if (lastPreset) void pin(lastPreset)
                  }}
                >
                  再试一次
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
