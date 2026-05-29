import { format } from 'date-fns'
import type { Class, ClassMark } from '~/lib/types'
import { dayNames, sections, weekDays } from './constants'
import ScheduleCourseCell from './ScheduleCourseCell'
import { getDayDate } from './utils'

type EditingNote = {
  id: string
  week: number
}

type ScheduleTableProps = {
  weekClasses: Class[]
  classMarks: Record<string, ClassMark>
  currentWeek: number
  firstWeekStartDate: string | null
  editingNote: EditingNote | null
  noteText: string
  onToggleAttendance: (classId: string, week: number) => void
  onStartEditingNote: (editingNote: EditingNote, note: string) => void
  onNoteTextChange: (note: string) => void
  onSaveNote: () => void
}

export default function ScheduleTable({
  weekClasses,
  classMarks,
  currentWeek,
  firstWeekStartDate,
  editingNote,
  noteText,
  onToggleAttendance,
  onStartEditingNote,
  onNoteTextChange,
  onSaveNote,
}: ScheduleTableProps) {
  const getClassMark = (classId: string, week: number) => classMarks[`${classId}-${week}`]

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card shadow-xs">
      <table className="w-full table-fixed border-collapse overflow-hidden">
        <colgroup>
          <col className="w-16" />
          {weekDays.map((day) => (
            <col key={day} style={{ width: `${100 / 7}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-muted/60">
            <th className="h-9 border-b border-r border-border text-center text-sm font-medium text-muted-foreground">节</th>
            {weekDays.map((day) => {
              const date = getDayDate(firstWeekStartDate, currentWeek, day)
              return (
                <th key={day} className="h-9 border-b border-r border-border text-center text-sm font-medium text-muted-foreground last:border-r-0">
                  <span>{dayNames[day]}</span>
                  {date && <span className="ml-2">{format(date, 'MM.dd')}</span>}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {sections.map((section) => (
            <tr key={section} className="h-[37px]">
              <td className="border-b border-r border-border text-center text-base font-medium text-muted-foreground">{section}</td>

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
                    <ScheduleCourseCell
                      course={course}
                      currentWeek={currentWeek}
                      mark={getClassMark(course.id, currentWeek)}
                      editingNote={editingNote}
                      noteText={noteText}
                      onToggleAttendance={onToggleAttendance}
                      onStartEditingNote={onStartEditingNote}
                      onNoteTextChange={onNoteTextChange}
                      onSaveNote={onSaveNote}
                    />
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
