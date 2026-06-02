import { Button } from '~/components/ui/button'

type BookmarkletRunStepProps = {
  onOpenEducationalSystem: () => void
}

export function BookmarkletRunStep({ onOpenEducationalSystem }: BookmarkletRunStepProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        <p className="font-medium text-foreground">操作步骤</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>点击下方按钮打开学校教务系统课程表页面。</li>
          <li>在新标签页登录，并确认已经进入课程表页面。</li>
          <li>点击浏览器书签栏里的“拖到书签栏保存”脚本。</li>
          <li>脚本会自动下载课程表 JSON 文件。</li>
          <li>下载完成后回到 ClassTrack，点击下一步上传该 JSON 文件。</li>
        </ol>
      </div>
      <Button type="button" className="w-full" variant="outline" onClick={onOpenEducationalSystem}>
        打开课程表页面
      </Button>
    </div>
  )
}
