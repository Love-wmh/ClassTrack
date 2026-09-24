import { AlertTriangle, BarChart3, BookOpenCheck, CheckCircle2, CircleSlash, ClipboardList, NotebookTabs, Percent } from 'lucide-react'
import { DashboardMetricCard } from './DashboardMetricCard'
import { cn } from '~/lib/utils'

type DashboardOverviewProps = {
  overview: {
    totalClasses: number
    uniqueCourseNames: number
    totalSessions: number
    pastSessions: number
    pastAttendedSessions: number
    pastAbsentSessions: number
    pastUnmarkedSessions: number
    notedSessions: number
    totalCompletionRate: number
    currentCompletionRate: number
    absenceRate: number
    markRate: number
  }
  formatPercent: (value: number) => string
  /**
   * 「出勤统计」是否开启。
   *
   * 关闭时不渲染依赖出勤标记的指标卡（完成度、缺勤率、标记覆盖率、未标记课次），
   * 只留课程实例 / 总课次数量 / 备注数量。
   */
  attendanceEnabled: boolean
}

export function DashboardOverview({ overview, formatPercent, attendanceEnabled }: DashboardOverviewProps) {
  return (
    <div className={cn('grid min-w-0 gap-3 md:grid-cols-2', attendanceEnabled ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
      {attendanceEnabled && (
        <>
          <DashboardMetricCard
            title="截止今日完成度"
            value={formatPercent(overview.currentCompletionRate)}
            description={`${overview.pastAttendedSessions} / ${overview.pastSessions} 个已发生课次`}
            icon={<CheckCircle2 className="size-5" />}
            tone="success"
          />
          <DashboardMetricCard
            title="截止今日缺勤率"
            value={formatPercent(overview.absenceRate)}
            description={`${overview.pastAbsentSessions} 个缺勤课次`}
            icon={<AlertTriangle className="size-5" />}
            tone={overview.pastAbsentSessions > 0 ? 'danger' : 'default'}
          />
          <DashboardMetricCard
            title="总课程完成度"
            value={formatPercent(overview.totalCompletionRate)}
            description={`${overview.pastAttendedSessions} / ${overview.totalSessions} 个总课次`}
            icon={<Percent className="size-5" />}
          />
          <DashboardMetricCard
            title="标记覆盖率"
            value={formatPercent(overview.markRate)}
            description={`${overview.pastUnmarkedSessions} 个已发生课次待记录`}
            icon={<ClipboardList className="size-5" />}
            tone={overview.pastUnmarkedSessions > 0 ? 'warning' : 'success'}
          />
        </>
      )}
      <DashboardMetricCard
        title="课程实例"
        value={overview.totalClasses}
        description={`${overview.uniqueCourseNames} 门课程名称`}
        icon={<BookOpenCheck className="size-5" />}
      />
      <DashboardMetricCard
        title="总课次数量"
        value={overview.totalSessions}
        description={`${overview.pastSessions} 个已发生课次`}
        icon={<BarChart3 className="size-5" />}
      />
      {attendanceEnabled && (
        <DashboardMetricCard
          title="未标记课次"
          value={overview.pastUnmarkedSessions}
          description="已发生但还没有标记是否上课"
          icon={<CircleSlash className="size-5" />}
          tone="warning"
        />
      )}
      <DashboardMetricCard
        title="备注数量"
        value={overview.notedSessions}
        description="带有备注的课程记录"
        icon={<NotebookTabs className="size-5" />}
      />
    </div>
  )
}
