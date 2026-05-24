import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '~/components/ui/button'

type ScheduleHeaderProps = {
  currentWeek: number
  maxWeek: number
  currentRealWeek: number
  onWeekChange: (week: number) => void
}

export default function ScheduleHeader({ currentWeek, maxWeek, currentRealWeek, onWeekChange }: ScheduleHeaderProps) {
  return (
    <div className="mb-5 flex items-center justify-between border-t border-gray-100 pt-5">
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
      </div>

      <Button
        variant="ghost"
        onClick={() => onWeekChange(currentRealWeek)}
        className="h-12 rounded-none bg-gray-50 px-4 text-base font-medium text-slate-700 hover:bg-gray-100 hover:text-slate-900"
      >
        返回本周
      </Button>
    </div>
  )
}
