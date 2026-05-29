import { BarChart3 } from 'lucide-react'
import { Card, CardContent } from '~/components/ui/card'

export function DashboardEmptyState() {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <BarChart3 className="size-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">暂无可分析的课程数据</h2>
          <p className="mt-2 text-sm text-muted-foreground">请先导入课程表，数据看板会自动生成完成度、缺勤率和课程分布分析。</p>
        </div>
      </CardContent>
    </Card>
  )
}
