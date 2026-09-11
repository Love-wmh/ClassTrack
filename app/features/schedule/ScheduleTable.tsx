import { format } from 'date-fns'
import type { Class, ClassMark } from '~/lib/types'
import { cn } from '~/lib/utils'
import { dayNames, sections, weekDays } from './constants'
import ScheduleCourseCell from './ScheduleCourseCell'
import { getDayDate } from './utils'

type ScheduleTableProps = {
  weekClasses: Class[]
  classMarks: Record<string, ClassMark>
  currentWeek: number
  firstWeekStartDate: string | null
  onCourseClick: (course: Class) => void
}

export default function ScheduleTable({ weekClasses, classMarks, currentWeek, firstWeekStartDate, onCourseClick }: ScheduleTableProps) {
  const getClassMark = (classId: string, week: number) => classMarks[`${classId}-${week}`]
  const occupiedCells = new Set(
    weekClasses.flatMap((course) => {
      const cells: string[] = []
      for (let section = course.startSection; section <= course.endSection; section += 1) {
        cells.push(`${course.dayOfWeek}-${section}`)
      }
      return cells
    })
  )

  return (
    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-contain rounded-md border border-border bg-card shadow-xs">
      <div className="grid h-full min-w-[760px] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] grid-rows-[2.25rem_repeat(12,minmax(0,1fr))] sm:grid-cols-[4rem_repeat(7,minmax(0,1fr))]">
        <div className="sticky left-0 z-30 flex items-center justify-center border-b border-r border-border bg-muted text-sm font-medium text-muted-foreground shadow-[2px_0_4px_rgb(0_0_0_/_0.06)]">
          节
        </div>
        {weekDays.map((day) => {
          const date = getDayDate(firstWeekStartDate, currentWeek, day)
          return (
            <div
              key={day}
              className={cn(
                'flex items-center justify-center border-b border-border bg-muted/60 text-sm font-medium text-muted-foreground',
                day !== 7 && 'border-r'
              )}
            >
              <span>{dayNames[day]}</span>
              {date && <span className="ml-1.5 text-xs font-normal">{format(date, 'MM.dd')}</span>}
            </div>
          )
        })}

        {sections.map((section) => (
          <div
            key={`section-${section}`}
            className={cn(
              'sticky left-0 z-20 flex items-center justify-center border-r border-border bg-card text-base font-medium text-muted-foreground shadow-[2px_0_4px_rgb(0_0_0_/_0.06)]',
              section !== 12 && 'border-b'
            )}
            style={{ gridColumn: 1, gridRow: section + 1 }}
          >
            {section}
          </div>
        ))}

        {weekDays.flatMap((day) =>
          sections.map((section) => {
            if (occupiedCells.has(`${day}-${section}`)) return null

            return (
              <div
                key={`empty-${day}-${section}`}
                className={cn(day !== 7 && 'border-r', section !== 12 && 'border-b', 'border-border')}
                style={{ gridColumn: day + 1, gridRow: section + 1 }}
              />
            )
          })
        )}

        {weekClasses.map((course) => (
          <div
            key={course.id}
            className={cn(
              'min-h-0 overflow-hidden border-border',
              course.dayOfWeek !== 7 && 'border-r',
              course.endSection !== 12 && 'border-b'
            )}
            style={{
              gridColumn: course.dayOfWeek + 1,
              gridRow: `${course.startSection + 1} / ${course.endSection + 2}`,
            }}
          >
            <ScheduleCourseCell course={course} mark={getClassMark(course.id, currentWeek)} onClick={() => onCourseClick(course)} />
          </div>
        ))}
      </div>
    </div>
  )
}
