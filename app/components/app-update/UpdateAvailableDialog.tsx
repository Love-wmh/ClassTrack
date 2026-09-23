import { Download, Sparkles } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import type { UpdateCandidate } from '~/lib/app-update/channels'
import { UPDATE_DOWNLOAD_ACTION, UPDATE_LATER_ACTION, UPDATE_SKIP_ACTION, formatReleaseNotes } from './updateDialogCopy'

/**
 * 发现新版本时弹出的前台模态框。
 *
 * **release 正文按纯文本渲染（prd T5）**：正文是远端内容，`marked` 的输出未经净化，
 * 直接 `dangerouslySetInnerHTML` 会在 WebView 里开出一个脚本注入面 —— 而这个 WebView 的
 * localStorage 里放着用户的全部课程数据。纯文本足够看懂「本次改动」，不值得为排版换一个注入面。
 */

type UpdateAvailableBodyProps = {
  candidate: UpdateCandidate
  currentVersion: string
  onDismiss: () => void
  onSkip: () => void
}

/**
 * 模态框**内容**（标题 / 版本对比 / 更新说明 / 三个按钮），不含 Dialog 外壳。
 *
 * 单独导出是为了可测：Radix 的 `DialogContent` 走 Portal，`renderToStaticMarkup` 渲染不出内容
 * （与 `WidgetGuideDialog` 同一约定）。
 */
export function UpdateAvailableBody({ candidate, currentVersion, onDismiss, onSkip }: UpdateAvailableBodyProps) {
  const notes = formatReleaseNotes(candidate.notes)

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          发现新版本 {candidate.version}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">
          <span>
            {currentVersion} → {candidate.version}
          </span>
          <Badge variant="secondary">{candidate.prerelease ? '测试版' : '正式版'}</Badge>
        </DialogDescription>
      </DialogHeader>

      {notes ? (
        <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
          {notes}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">本次发布没有填写更新说明。</p>
      )}

      <DialogFooter className="gap-2 sm:justify-end">
        <Button variant="ghost" className="min-h-11 sm:min-h-9" onClick={onSkip}>
          {UPDATE_SKIP_ACTION}
        </Button>
        <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={onDismiss}>
          {UPDATE_LATER_ACTION}
        </Button>
        {/*
          用锚点导航而不是 window.open(url, '_blank')：Capacitor 把非同源导航交给系统浏览器
          （Bridge.launchIntent → Intent.ACTION_VIEW），而这个仓库的 WebChromeClient 没有覆写
          onCreateWindow，'_blank' 在新窗口被禁用时可能什么都不发生。锚点走得是稳的那条路。
          href 用的是 `toUpdateCandidate` 校验过前缀的地址（prd T6）。
        */}
        <Button asChild className="min-h-11 sm:min-h-9">
          <a href={candidate.pageUrl} rel="noreferrer">
            <Download className="size-4" aria-hidden="true" />
            {UPDATE_DOWNLOAD_ACTION}
          </a>
        </Button>
      </DialogFooter>
    </>
  )
}

type UpdateAvailableDialogProps = {
  candidate: UpdateCandidate
  currentVersion: string
  onDismiss: () => void
  onSkip: () => void
}

export default function UpdateAvailableDialog({ candidate, currentVersion, onDismiss, onSkip }: UpdateAvailableDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onDismiss())}>
      <DialogContent className="max-w-md" data-update-version={candidate.version}>
        <UpdateAvailableBody candidate={candidate} currentVersion={currentVersion} onDismiss={onDismiss} onSkip={onSkip} />
      </DialogContent>
    </Dialog>
  )
}
