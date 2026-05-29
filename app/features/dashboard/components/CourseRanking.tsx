import { ChartFrame } from './ChartFrame'

type CourseRankingItem = {
  name: string
  total: number
  pastTotal: number
  attended: number
  absent: number
  unmarked: number
  completionRate: number
  absenceRate: number
}

type CourseRankingProps = {
  data: CourseRankingItem[]
  formatPercent: (value: number) => string
}

export function CourseRanking({ data, formatPercent }: CourseRankingProps) {
  return (
    <ChartFrame title="课程完成度排行" description="按课程聚合，优先展示缺勤或未标记较多的课程。">
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.name} className="rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  已上 {item.attended} / 应上 {item.total}，缺勤 {item.absent}，未标记 {item.unmarked}
                </p>
              </div>
              <div className="text-right text-sm font-semibold">{formatPercent(item.completionRate)}</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gray-900" style={{ width: `${Math.min(item.completionRate, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </ChartFrame>
  )
}
