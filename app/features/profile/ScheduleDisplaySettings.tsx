import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Switch } from '~/components/ui/switch'
import { useAttendanceStore } from '~/store/attendanceStore'
import { useScheduleDisplayStore } from '~/store/scheduleDisplayStore'

export default function ScheduleDisplaySettings() {
  // 出勤痕迹是两层开关：能力层（出勤统计）关掉时，这一层的显示开关也就没有可显示的东西了。
  const attendanceEnabled = useAttendanceStore((state) => state.enabled)
  const showAttendanceStatus = useScheduleDisplayStore((state) => state.showAttendanceStatus)
  const showOutOfWeekCourses = useScheduleDisplayStore((state) => state.showOutOfWeekCourses)
  const setShowAttendanceStatus = useScheduleDisplayStore((state) => state.setShowAttendanceStatus)
  const setShowOutOfWeekCourses = useScheduleDisplayStore((state) => state.setShowOutOfWeekCourses)

  return (
    <Card id="card-schedule-display">
      <CardHeader>
        <CardTitle>课表显示</CardTitle>
        <CardDescription>调整课表课程格子上显示的信息。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <label className="text-sm font-medium" htmlFor="schedule-display-attendance">
              在课表上显示出勤状态
            </label>
            <p className="text-xs text-muted-foreground">已上课程打勾，未上课程淡化显示。</p>
            {!attendanceEnabled && <p className="text-xs text-muted-foreground">出勤统计当前已关闭，这一项在课表上暂时没有效果。</p>}
          </div>
          <Switch
            id="schedule-display-attendance"
            className="self-start"
            checked={showAttendanceStatus}
            onCheckedChange={setShowAttendanceStatus}
            aria-label="在课表上显示出勤状态"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <label className="text-sm font-medium" htmlFor="schedule-display-out-of-week">
              淡化显示非本周课程
            </label>
            <p className="text-xs text-muted-foreground">本周没有的课程以灰色卡片显示，方便查看整周安排。</p>
          </div>
          <Switch
            id="schedule-display-out-of-week"
            className="self-start"
            checked={showOutOfWeekCourses}
            onCheckedChange={setShowOutOfWeekCourses}
            aria-label="淡化显示非本周课程"
          />
        </div>
      </CardContent>
    </Card>
  )
}
