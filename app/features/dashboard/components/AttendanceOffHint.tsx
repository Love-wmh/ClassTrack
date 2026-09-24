import { BarChart3 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { ATTENDANCE_OFF_HINT } from '../dashboardCopy'

/**
 * 关闭「出勤统计」时，数据看板顶部那条提示卡。
 *
 * 两个职责：① 说明为什么少了完成度、缺勤率这些指标；② 给出**唯一**的开启入口（个人中心）。
 * 文案里必须写明「已记录的出勤数据仍保留在本地与备份中」—— 见 `dashboardCopy.ts` 的注释。
 */
export function AttendanceOffHint() {
  const navigate = useNavigate()

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <BarChart3 className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{ATTENDANCE_OFF_HINT.title}</p>
            <p className="text-sm text-muted-foreground">{ATTENDANCE_OFF_HINT.description}</p>
          </div>
        </div>
        <Button
          className="min-h-11 w-full shrink-0 sm:min-h-9 sm:w-auto"
          type="button"
          variant="outline"
          onClick={() => void navigate('/profile')}
        >
          {ATTENDANCE_OFF_HINT.action}
        </Button>
      </CardContent>
    </Card>
  )
}
