import { CheckCircle2, CircleAlert } from 'lucide-react'
import { Input } from '~/components/ui/input'
import type { Class, ClassMark } from '~/lib/types'
import { cn } from '~/lib/utils'
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
      className={cn(
        'group relative flex h-full min-h-[74px] w-full cursor-pointer flex-col overflow-hidden px-2 py-1.5 transition-colors',
        courseColor,
        isAttended ? 'ring-1 ring-inset ring-emerald-300/70' : 'ring-1 ring-inset ring-rose-300/70'
      )}
      onClick={() => onToggleAttendance(course.id, currentWeek)}
      title={isAttended ? '已上' : '未上'}
    >
      <div className={cn('absolute left-0 top-0 h-full w-0.5', isAttended ? 'bg-emerald-500' : 'bg-rose-500')} />
      <div className="flex items-start justify-between gap-1 pl-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-5 text-slate-950">{course.name}</div>
          <div className="mt-0.5 truncate text-xs leading-5 text-slate-600">{course.classroom}</div>
        </div>
        <div className={cn('mt-0.5 shrink-0', isAttended ? 'text-emerald-600' : 'text-rose-600')}>
          {isAttended ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
        </div>
      </div>

      {isEditingNote ? (
        <div className="mt-1 pl-1" onClick={(event) => event.stopPropagation()}>
          <Input
            value={noteText}
            onChange={(event) => onNoteTextChange(event.target.value)}
            placeholder="添加备注..."
            className="h-6 rounded-sm bg-white/70 px-2 text-xs"
            autoFocus
            onBlur={onSaveNote}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.stopPropagation()
                onSaveNote()
              }
            }}
          />
        </div>
      ) : (
        <div
          className="mt-auto min-h-[18px] truncate pl-1 text-xs leading-[18px] text-slate-600/90"
          onClick={(event) => {
            event.stopPropagation()
            onStartEditingNote({ id: course.id, week: currentWeek }, note || '')
          }}
        >
          {note || <span className="text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">点击添加备注</span>}
        </div>
      )}
    </div>
  )
}
