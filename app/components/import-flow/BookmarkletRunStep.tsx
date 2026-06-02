import { Button } from '~/components/ui/button'
import { ImportStepDescription } from './ImportStepDescription'

type BookmarkletRunStepProps = {
  onOpenEducationalSystem: () => void
}

const runDescriptionSteps = [
  '点击下方按钮打开学校教务系统课程表页面。',
  '在新标签页登录，并确认已经进入课程表页面。',
  '点击浏览器书签栏里的 “数据导出器”。',
  '脚本会自动下载课程表 JSON 文件。',
  '下载完成后回到 ClassTrack，点击下一步上传该 JSON 文件。',
]

export function BookmarkletRunStep({ onOpenEducationalSystem }: BookmarkletRunStepProps) {
  return (
    <div className="space-y-4">
      <ImportStepDescription steps={runDescriptionSteps} />
      <Button type="button" className="w-full" variant="outline" onClick={onOpenEducationalSystem}>
        打开课程表页面
      </Button>
    </div>
  )
}
