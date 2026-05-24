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
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="w-16 p-3 text-center text-sm font-medium text-gray-600 border-b border-r border-gray-200">节</th>
            {weekDays.map((day) => {
              const date = getDayDate(firstWeekStartDate, currentWeek, day)
              return (
                <th key={day} className="p-3 text-center text-sm font-medium text-gray-700 border-b border-r border-gray-200 min-w-[120px]">
                  <div>{dayNames[day]}</div>
                  {date && <div className="text-xs text-muted-foreground mt-1">{format(date, 'MM/dd')}</div>}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {sections.map((section) => (
            <tr key={section} className="hover:bg-gray-50/50">
              <td className="p-2 text-center text-sm text-gray-600 border-b border-r border-gray-200 bg-gray-50/80">{section}</td>

              {weekDays.map((day) => {
                const course = weekClasses.find((classItem) => classItem.dayOfWeek === day && classItem.startSection === section)
                const coveredCourse = weekClasses.find(
                  (classItem) => classItem.dayOfWeek === day && classItem.startSection < section && classItem.endSection >= section
                )

                if (coveredCourse && !course) {
                  return <td key={day} className="border-b border-r border-gray-200" />
                }

                if (!course) {
                  return <td key={day} className="p-2 border-b border-r border-gray-200 min-h-[60px]" />
                }

                const rowSpan = course.endSection - course.startSection + 1

                return (
                  <td key={day} rowSpan={rowSpan} className="p-2 border-b border-r border-gray-200 align-top">
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
