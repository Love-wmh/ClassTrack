import { useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, CircleAlert } from 'lucide-react'
import ConfirmDialog from '~/components/dialog/ConfirmDialog'
import WidgetPinEntry from './WidgetPinEntry'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

type ScheduleHeaderProps = {
  currentWeek: number
  maxWeek: number
  currentRealWeek: number
  /**
   * 「出勤统计」是否开启。
   *
   * 关闭时整组批量标记入口（「全部已上 / 全部未上」及其确认弹窗）不渲染，
   * 手机端左侧动作组随之从 5 列收窄到 3 列 —— 少两个按钮还留着空洞会让顶栏显得断裂。
   */
  attendanceEnabled: boolean
  onWeekChange: (week: number) => void
  onMarkAllAsAttended: () => void
  onMarkAllAsUnattended: () => void
}

type ConfirmAction = 'attended' | 'unattended'

export default function ScheduleHeader({
  currentWeek,
  maxWeek,
  currentRealWeek,
  attendanceEnabled,
  onWeekChange,
  onMarkAllAsAttended,
  onMarkAllAsUnattended,
}: ScheduleHeaderProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const isAttendedAction = confirmAction === 'attended'
  const confirmTitle = isAttendedAction ? '确认全部标记为已上？' : '确认全部标记为未上？'
  const confirmDescription = isAttendedAction
    ? `将把第 ${currentWeek} 周的所有课程标记为已上，此操作会覆盖当前标记。`
    : `将把第 ${currentWeek} 周的所有课程标记为未上，此操作会覆盖当前标记。`

  const handleConfirm = () => {
    if (confirmAction === 'attended') {
      onMarkAllAsAttended()
    }

    if (confirmAction === 'unattended') {
      onMarkAllAsUnattended()
    }

    setConfirmAction(null)
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 md:mb-4 md:flex-row md:items-center md:justify-between">
        <div
          className={cn(
            'grid items-center gap-1.5 md:flex md:gap-2',
            attendanceEnabled ? 'grid-cols-[2.25rem_2.25rem_1fr_1fr_2.25rem]' : 'grid-cols-[2.25rem_2.25rem_2.25rem]'
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onWeekChange(Math.max(1, currentWeek - 1))}
            disabled={currentWeek <= 1}
            aria-label="上一周"
            className="h-9 w-9 bg-card text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onWeekChange(Math.min(maxWeek, currentWeek + 1))}
            disabled={currentWeek >= maxWeek}
            aria-label="下一周"
            className="h-9 w-9 bg-card text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </Button>
          {attendanceEnabled && (
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirmAction('attended')}
                className="h-9 min-w-0 bg-emerald-50 px-2 text-sm font-medium text-emerald-700 shadow-xs hover:bg-emerald-100 hover:text-emerald-900 md:px-3"
              >
                <CheckCircle2 className="size-4 md:mr-1.5" />
                全部已上
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmAction('unattended')}
                className="h-9 min-w-0 bg-rose-50 px-2 text-sm font-medium text-rose-700 shadow-xs hover:bg-rose-100 hover:text-rose-900 md:px-3"
              >
                <CircleAlert className="size-4 md:mr-1.5" />
                全部未上
              </Button>
            </>
          )}
          {/* 应用内「添加到桌面」：只在 Android 原生渲染（见组件注释）。放在动作组同一行，
              不额外占一行高度 —— 顶栏本来就是这次要压缩的地方。 */}
          <WidgetPinEntry />
        </div>

        <div className="grid grid-cols-2 items-center gap-2 md:flex">
          <span className="flex h-9 items-center justify-center rounded-md bg-card px-3 text-foreground shadow-xs">
            第 {currentWeek} 周
          </span>
          <Button
            variant="ghost"
            onClick={() => onWeekChange(currentRealWeek)}
            className="h-9 bg-card px-3 text-sm font-medium text-foreground shadow-xs hover:bg-muted"
          >
            返回本周
          </Button>
        </div>
      </div>

      {attendanceEnabled && (
        <ConfirmDialog
          open={confirmAction !== null}
          title={confirmTitle}
          description={confirmDescription}
          confirmVariant={isAttendedAction ? 'default' : 'destructive'}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  )
}
