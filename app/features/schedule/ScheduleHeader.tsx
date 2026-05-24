import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '~/components/ui/button'
import type { School } from '~/lib/types'

type ScheduleHeaderProps = {
  school: School | null
  currentWeek: number
  maxWeek: number
  onWeekChange: (week: number) => void
}

export default function ScheduleHeader({ school, currentWeek, maxWeek, onWeekChange }: ScheduleHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-lg shadow-sm">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">课程表</h1>
        {school && <p className="text-sm text-gray-500">{school.name}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onWeekChange(Math.max(1, currentWeek - 1))}
          disabled={currentWeek <= 1}
          className="h-10 w-10"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <span className="text-lg font-medium text-gray-700 w-20 text-center">第 {currentWeek} 周</span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onWeekChange(Math.min(maxWeek, currentWeek + 1))}
          disabled={currentWeek >= maxWeek}
          className="h-10 w-10"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </div>
  )
}
