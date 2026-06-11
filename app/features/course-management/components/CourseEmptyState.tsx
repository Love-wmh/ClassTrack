import { NotebookTabs } from 'lucide-react'
import { Card, CardContent } from '~/components/ui/card'

export function CourseEmptyState() {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <NotebookTabs className="size-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">暂无可管理的课程</h2>
          <p className="mt-2 text-sm text-muted-foreground">请先导入课程表，课程管理会自动汇总课程名称、教师、教室和上课安排。</p>
        </div>
      </CardContent>
    </Card>
  )
}
