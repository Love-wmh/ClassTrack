import { BarChart3 } from 'lucide-react'
import { Card, CardContent } from '~/components/ui/card'
import { getDashboardEmptyDescription } from '../dashboardCopy'

/** 无课程时的空态；关闭出勤统计时不提完成度与缺勤率（文案见 `dashboardCopy.ts`）。 */
export function DashboardEmptyState({ attendanceEnabled }: { attendanceEnabled: boolean }) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <BarChart3 className="size-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">暂无可分析的课程数据</h2>
          <p className="mt-2 text-sm text-muted-foreground">{getDashboardEmptyDescription(attendanceEnabled)}</p>
        </div>
      </CardContent>
    </Card>
  )
}
