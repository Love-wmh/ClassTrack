import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

type RiskCourse = {
  name: string
  pastTotal: number
  absent: number
  unmarked: number
  absenceRate: number
}

type RiskCourseListProps = {
  data: RiskCourse[]
  formatPercent: (value: number) => string
}

export function RiskCourseList({ data, formatPercent }: RiskCourseListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>风险课程</CardTitle>
        <CardDescription>优先关注缺勤或未记录较多的课程。</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="rounded-md bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">暂无风险课程，当前记录状态良好。</div>
        ) : (
          <div className="space-y-3">
            {data.map((item) => (
              <div key={item.name} className="flex items-start gap-3 rounded-md border bg-background p-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <span className="text-xs font-medium text-red-600">缺勤率 {formatPercent(item.absenceRate)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    已发生 {item.pastTotal} 次，缺勤 {item.absent} 次，未标记 {item.unmarked} 次
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
