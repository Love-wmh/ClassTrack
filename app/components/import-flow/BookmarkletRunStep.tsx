import { Button } from '~/components/ui/button'
import { ImportStepDescription } from './ImportStepDescription'

type BookmarkletRunStepProps = {
  onOpenEducationalSystem: () => void
}

const runDescriptionSteps = [
  <strong key="open" className="font-semibold text-foreground">
    打开教务系统，登录后进入课程表页面。
  </strong>,
  '点击浏览器书签栏里的 “数据导出器”。',
  '脚本会自动下载课程表 JSON 文件。',
  '下载完成后回到 ClassTrack，点击下一步上传该 JSON 文件。',
]

export function BookmarkletRunStep({ onOpenEducationalSystem }: BookmarkletRunStepProps) {
  return (
    <div className="space-y-4">
      <ImportStepDescription steps={runDescriptionSteps} />
      <Button type="button" className="w-full" variant="outline" onClick={onOpenEducationalSystem}>
        打开教务系统
      </Button>
    </div>
  )
}
