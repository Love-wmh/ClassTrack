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
    <div className="overflow-x-auto border border-slate-200 bg-white">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="h-9 w-[210px] border-b border-r border-slate-200 text-center text-base font-normal text-slate-600">节</th>
            {weekDays.map((day) => {
              const date = getDayDate(firstWeekStartDate, currentWeek, day)
              return (
                <th key={day} className="h-9 border-b border-r border-slate-200 text-center text-base font-normal text-slate-600 last:border-r-0">
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
              <td className="border-b border-r border-slate-200 text-center text-lg font-normal text-zinc-500">{section}</td>

              {weekDays.map((day) => {
                const course = weekClasses.find((classItem) => classItem.dayOfWeek === day && classItem.startSection === section)
                const coveredCourse = weekClasses.find(
                  (classItem) => classItem.dayOfWeek === day && classItem.startSection < section && classItem.endSection >= section
                )

                if (coveredCourse && !course) {
                  return <td key={day} className="border-b border-r border-slate-200 last:border-r-0" />
                }

                if (!course) {
                  return <td key={day} className="border-b border-r border-slate-200 last:border-r-0" />
                }

                const rowSpan = course.endSection - course.startSection + 1

                return (
                  <td key={day} rowSpan={rowSpan} className="border-b border-r border-slate-200 align-top last:border-r-0">
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
