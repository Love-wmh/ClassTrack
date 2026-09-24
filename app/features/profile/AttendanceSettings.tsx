import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Switch } from '~/components/ui/switch'
import { useAttendanceStore } from '~/store/attendanceStore'

/**
 * 个人中心的「出勤统计」开关（用户 2026-09-24 口径：默认关闭）。
 *
 * 关闭 = **不显示**：课表不画已上/未上标记、顶栏没有批量标记，看板不出现完成度、缺勤率与风险课程。
 * 打开后才出现，且表现与历史版本逐项一致。
 *
 * 卡片上必须写明「数据不会被删除」（诚实性口径，与「桌面小工具」卡的写法同一约定）：
 * 用户看不到标记的第一反应就是「我的记录丢了」。
 */
export default function AttendanceSettings() {
  const enabled = useAttendanceStore((state) => state.enabled)
  const setAttendanceEnabled = useAttendanceStore((state) => state.setAttendanceEnabled)

  return (
    <Card id="card-attendance">
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle>出勤统计</CardTitle>
          <CardDescription>开启后可以在课程表标记每节课是否上，并在数据看板看到完成度、缺勤率、周趋势与风险课程。</CardDescription>
        </div>
        <Badge variant={enabled ? 'default' : 'secondary'} className="self-start">
          {enabled ? '已开启' : '已关闭'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-sm font-medium" htmlFor="attendance-enabled">
            启用出勤标记与统计
          </label>
          <Switch
            id="attendance-enabled"
            className="self-start"
            checked={enabled}
            onCheckedChange={setAttendanceEnabled}
            aria-label="启用出勤标记与统计"
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {enabled
            ? '已开启：课程表会显示每节课的已上/未上标记，数据看板会显示完成度、缺勤率、周趋势与风险课程。'
            : '已关闭：课程表不显示已上/未上标记，数据看板不显示完成度、缺勤率与风险课程。关闭只是不显示 —— 已记录的出勤数据仍保留在本地与备份中，重新开启即可看到。'}
        </p>
      </CardContent>
    </Card>
  )
}
