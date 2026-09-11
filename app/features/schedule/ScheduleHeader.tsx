import { useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, CircleAlert } from 'lucide-react'
import ConfirmDialog from '~/components/dialog/ConfirmDialog'
import { Button } from '~/components/ui/button'

type ScheduleHeaderProps = {
  currentWeek: number
  maxWeek: number
  currentRealWeek: number
  onWeekChange: (week: number) => void
  onMarkAllAsAttended: () => void
  onMarkAllAsUnattended: () => void
}

type ConfirmAction = 'attended' | 'unattended'

export default function ScheduleHeader({
  currentWeek,
  maxWeek,
  currentRealWeek,
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
      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-[2.5rem_2.5rem_1fr_1fr] items-center gap-2 sm:flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onWeekChange(Math.max(1, currentWeek - 1))}
            disabled={currentWeek <= 1}
            aria-label="上一周"
            className="h-10 w-10 bg-card text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onWeekChange(Math.min(maxWeek, currentWeek + 1))}
            disabled={currentWeek >= maxWeek}
            aria-label="下一周"
            className="h-10 w-10 bg-card text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmAction('attended')}
            className="h-10 min-w-0 bg-emerald-50 px-2 font-medium text-emerald-700 shadow-xs hover:bg-emerald-100 hover:text-emerald-900 sm:px-3.5"
          >
            <CheckCircle2 className="size-4 sm:mr-1.5" />
            全部已上
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmAction('unattended')}
            className="h-10 min-w-0 bg-rose-50 px-2 font-medium text-rose-700 shadow-xs hover:bg-rose-100 hover:text-rose-900 sm:px-3.5"
          >
            <CircleAlert className="size-4 sm:mr-1.5" />
            全部未上
          </Button>
        </div>

        <div className="grid grid-cols-2 items-center gap-2 sm:flex">
          <span className="flex h-10 items-center justify-center rounded-md bg-card px-3.5 text-foreground shadow-xs">
            第 {currentWeek} 周
          </span>
          <Button
            variant="ghost"
            onClick={() => onWeekChange(currentRealWeek)}
            className="h-10 bg-card px-3.5 font-medium text-foreground shadow-xs hover:bg-muted"
          >
            返回本周
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmTitle}
        description={confirmDescription}
        confirmVariant={isAttendedAction ? 'default' : 'destructive'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
