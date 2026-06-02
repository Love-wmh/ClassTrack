import { BookmarkletButton } from '~/components/common/BookmarkletButton'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'
import { ImportStepDescription } from './ImportStepDescription'
import type { BookmarkletAdapter } from '~/lib/types'

type BookmarkletInstallStepProps = {
  adapter: BookmarkletAdapter | undefined
  term: string
  bookmarkletHref: string
  onTermChange: (term: string) => void
  onCopyBookmarklet: () => void
}

const installDescriptionSteps = [
  '确认学年学期代码正确。',
  '将下方“数据导出器”按钮拖拽到浏览器书签栏。',
  '如果无法拖拽，可以点击“复制书签脚本”后手动新建书签。',
  '安装完成后点击下一步，前往教务系统导出课程表 JSON 文件。',
]

export function BookmarkletInstallStep({ adapter, term, bookmarkletHref, onTermChange, onCopyBookmarklet }: BookmarkletInstallStepProps) {
  if (!adapter) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        当前学校暂未配置书签脚本导出器，请先让贡献者在 <code className="rounded bg-muted px-1 py-0.5">app/lib/bookmarklets</code>{' '}
        中新增适配器。
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="term">学年学期代码</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Input id="term" value={term} placeholder={adapter.defaultTerm} onChange={(event) => onTermChange(event.target.value)} />
            </TooltipTrigger>
            <TooltipContent side="top">该参数会写入书签脚本，重新修改后需要重新拖拽安装脚本或复制脚本代码。</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <ImportStepDescription steps={installDescriptionSteps} />

      <div className="rounded-md border bg-muted/30 p-4">
        <div className="space-y-1">
          <Label>{adapter.name}</Label>
          <p className="text-sm text-muted-foreground">{adapter.description}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BookmarkletButton href={bookmarkletHref} />
          <Button type="button" variant="outline" onClick={onCopyBookmarklet}>
            复制书签脚本
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">如果看不到书签栏，可先显示浏览器书签栏，再把按钮拖到书签栏。</p>
      </div>
    </div>
  )
}
