import { Clock } from 'lucide-react'
import type { CourseSchedule } from '../hooks/useCourseManagement'

type CourseScheduleListProps = {
  schedules: CourseSchedule[]
}

export function CourseScheduleList({ schedules }: CourseScheduleListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Clock className="size-4 text-muted-foreground" />
        <span>上课安排</span>
      </div>
      <div className="space-y-2">
        {schedules.map((schedule) => (
          <div key={schedule.id} className="rounded-md border bg-background px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
              <span>{schedule.weekday}</span>
              <span>{schedule.sections}</span>
              <span>{schedule.time}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {schedule.weeks} · {schedule.classroom}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
