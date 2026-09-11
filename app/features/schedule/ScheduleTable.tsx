import { format } from 'date-fns'
import type { Class, ClassMark } from '~/lib/types'
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

  return (
    <div className="min-h-0 flex-1 overscroll-contain overflow-auto rounded-md border border-border bg-card shadow-xs">
      <table className="h-full min-h-[520px] w-full min-w-[760px] table-fixed border-collapse sm:min-h-0">
        <colgroup>
          <col className="w-14 sm:w-16" />
          {weekDays.map((day) => (
            <col key={day} style={{ width: `${100 / 7}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky left-0 z-30 h-9 border-b border-r border-border bg-muted text-center text-sm font-medium text-muted-foreground shadow-[2px_0_4px_rgb(0_0_0_/_0.06)]">
              节
            </th>
            {weekDays.map((day) => {
              const date = getDayDate(firstWeekStartDate, currentWeek, day)
              return (
                <th
                  key={day}
                  className="h-9 border-b border-r border-border text-center text-sm font-medium text-muted-foreground last:border-r-0"
                >
                  <span>{dayNames[day]}</span>
                  {date && <span className="ml-1.5 text-xs font-normal">{format(date, 'MM.dd')}</span>}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {sections.map((section) => (
            <tr key={section} className="h-[calc((100%-2.25rem)/12)] min-h-[40px]">
              <td className="sticky left-0 z-20 border-b border-r border-border bg-card text-center text-base font-medium text-muted-foreground shadow-[2px_0_4px_rgb(0_0_0_/_0.06)]">
                {section}
              </td>

              {weekDays.map((day) => {
                const course = weekClasses.find((classItem) => classItem.dayOfWeek === day && classItem.startSection === section)
                const coveredCourse = weekClasses.find(
                  (classItem) => classItem.dayOfWeek === day && classItem.startSection < section && classItem.endSection >= section
                )

                if (coveredCourse && !course) {
                  return <td key={day} className="border-b border-r border-border last:border-r-0" />
                }

                if (!course) {
                  return <td key={day} className="border-b border-r border-border last:border-r-0" />
                }

                const rowSpan = course.endSection - course.startSection + 1

                return (
                  <td key={day} rowSpan={rowSpan} className="border-b border-r border-border align-top last:border-r-0">
                    <ScheduleCourseCell course={course} mark={getClassMark(course.id, currentWeek)} onClick={() => onCourseClick(course)} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
