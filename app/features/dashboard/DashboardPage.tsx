import { CalendarClock } from 'lucide-react'
import { Card, CardContent } from '~/components/ui/card'
import { CategoryBreakdownChart } from './components/CategoryBreakdownChart'
import { CourseRanking } from './components/CourseRanking'
import { DashboardEmptyState } from './components/DashboardEmptyState'
import { DashboardOverview } from './components/DashboardOverview'
import { RiskCourseList } from './components/RiskCourseList'
import { SectionDistributionChart } from './components/SectionDistributionChart'
import { WeekdayDistributionChart } from './components/WeekdayDistributionChart'
import { WeeklyTrendChart } from './components/WeeklyTrendChart'
import { useDashboardStats } from './hooks/useDashboardStats'

export default function DashboardPage() {
  const stats = useDashboardStats()

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden bg-background p-5 md:p-6">
      <div className="no-scrollbar flex-1 overflow-y-auto pr-2">
        <div className="mx-auto w-full max-w-7xl space-y-4">
          <div className="flex flex-col justify-between gap-3 rounded-md border bg-card px-5 py-4 shadow-xs md:flex-row md:items-center">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">数据看板</h1>
              <p className="mt-1 text-sm text-muted-foreground">展示课程完成度、缺勤率、课程分布和风险课程分析。</p>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4" />
              <span>{stats.range.label}</span>
            </div>
          </div>

          {!stats.hasClasses ? (
            <DashboardEmptyState />
          ) : (
            <>
              {!stats.range.hasDateBase && (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    未设置第一周第一天，截止今日相关指标将按当前周次估算。可在个人中心设置学期开始日期以获得更准确的数据。
                  </CardContent>
                </Card>
              )}

              <DashboardOverview overview={stats.overview} formatPercent={stats.formatPercent} />

              <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <WeeklyTrendChart data={stats.weeklyTrend} />
                <RiskCourseList data={stats.riskCourses} formatPercent={stats.formatPercent} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <CourseRanking data={stats.courseRanking} formatPercent={stats.formatPercent} />
                <WeekdayDistributionChart data={stats.weekdayDistribution} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <CategoryBreakdownChart data={stats.categoryBreakdown} title="课程类别分析" description="按课程类别统计总课次占比。" />
                <CategoryBreakdownChart data={stats.typeBreakdown} title="课程性质分析" description="按课程性质统计总课次占比。" />
              </div>

              <SectionDistributionChart data={stats.sectionDistribution} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
