import { Input } from '~/components/ui/input'
import type { Class, ClassMark } from '~/lib/types'
import { getCourseColor } from './utils'

type EditingNote = {
  id: string
  week: number
}

type ScheduleCourseCellProps = {
  course: Class
  currentWeek: number
  mark: ClassMark | undefined
  editingNote: EditingNote | null
  noteText: string
  onToggleAttendance: (classId: string, week: number) => void
  onStartEditingNote: (editingNote: EditingNote, note: string) => void
  onNoteTextChange: (note: string) => void
  onSaveNote: () => void
}

export default function ScheduleCourseCell({
  course,
  currentWeek,
  mark,
  editingNote,
  noteText,
  onToggleAttendance,
  onStartEditingNote,
  onNoteTextChange,
  onSaveNote,
}: ScheduleCourseCellProps) {
  const isAttended = !!mark?.isAttended
  const note = mark?.note || ''
  const courseColor = getCourseColor(course.courseId)
  const isEditingNote = editingNote?.id === course.id && editingNote?.week === currentWeek

  return (
    <div
      className={`w-full p-2 rounded cursor-pointer transition-all shadow-sm outline outline-3 ${
        isAttended ? `${courseColor} outline-green-500 outline-offset-[-2px]` : `${courseColor} outline-red-500 outline-offset-[-2px]`
      }`}
      onClick={() => onToggleAttendance(course.id, currentWeek)}
    >
      <div className="font-medium text-sm mb-1">{course.name}</div>
      <div className="text-xs text-gray-600 mb-1">{course.classroom}</div>

      {isEditingNote ? (
        <div className="mt-1">
          <Input
            value={noteText}
            onChange={(event) => onNoteTextChange(event.target.value)}
            placeholder="添加备注..."
            className="text-xs h-6 px-2"
            autoFocus
            onBlur={onSaveNote}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.stopPropagation()
                onSaveNote()
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : (
        <div
          className="text-xs text-gray-700 mt-1 bg-white/40 rounded px-1 py-0.5 min-h-[18px] cursor-pointer"
          onClick={(event) => {
            event.stopPropagation()
            onStartEditingNote({ id: course.id, week: currentWeek }, note || '')
          }}
        >
          {note || <span className="text-gray-400 italic text-xs">点击添加备注</span>}
        </div>
      )}
    </div>
  )
}
