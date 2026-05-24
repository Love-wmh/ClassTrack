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
      <div className="mb-5 flex items-center justify-between pt-5">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onWeekChange(Math.max(1, currentWeek - 1))}
            disabled={currentWeek <= 1}
            className="h-12 w-12 rounded-none bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onWeekChange(Math.min(maxWeek, currentWeek + 1))}
            disabled={currentWeek >= maxWeek}
            className="h-12 w-12 rounded-none bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmAction('attended')}
            className="h-12 rounded-none bg-emerald-50 px-4 text-base font-medium text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900"
          >
            <CheckCircle2 className="mr-1.5 size-4" />
            全部已上
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmAction('unattended')}
            className="h-12 rounded-none bg-rose-50 px-4 text-base font-medium text-rose-700 hover:bg-rose-100 hover:text-rose-900"
          >
            <CircleAlert className="mr-1.5 size-4" />
            全部未上
          </Button>
        </div>

        <Button
          variant="ghost"
          onClick={() => onWeekChange(currentRealWeek)}
          className="h-12 rounded-none bg-gray-50 px-4 text-base font-medium text-slate-700 hover:bg-gray-100 hover:text-slate-900"
        >
          返回本周
        </Button>
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
