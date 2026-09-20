import { CheckCircle2, CircleAlert } from 'lucide-react'
import type { Class, ClassMark } from '~/lib/types'
import { cn } from '~/lib/utils'
import { getCourseColor, getWeekParityLabel } from './utils'

type ScheduleCourseCellProps = {
  course: Class
  mark: ClassMark | undefined
  showClassroom: boolean
  showTeacher: boolean
  showNote: boolean
  onClick: () => void
}

export default function ScheduleCourseCell({ course, mark, showClassroom, showTeacher, showNote, onClick }: ScheduleCourseCellProps) {
  const isAttended = !!mark?.isAttended
  const note = mark?.note || ''
  const parityLabel = getWeekParityLabel(course.weeks)
  const courseColor = getCourseColor(course.courseId)

  return (
    <button
      type="button"
      data-course-cell
      className={cn(
        'group relative flex h-full min-h-0 w-full cursor-pointer flex-col overflow-hidden px-1 py-0.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-row md:items-start md:justify-between md:gap-1 md:px-2 md:py-1.5',
        courseColor,
        isAttended ? 'ring-1 ring-inset ring-emerald-300/70' : 'ring-1 ring-inset ring-rose-300/70'
      )}
      onClick={onClick}
      title={`${course.name}，${isAttended ? '已上' : '未上'}，点击查看详情`}
    >
      <span className={cn('absolute left-0 top-0 h-full w-0.5', isAttended ? 'bg-emerald-500' : 'bg-rose-500')} />
      <span className="flex min-h-0 flex-1 flex-col pl-1 md:min-w-0">
        <span
          data-course-name
          className="block text-[11px] font-medium leading-[1.2] text-slate-950 md:line-clamp-2 md:text-sm md:leading-5"
        >
          {course.name}
        </span>
        {parityLabel && (
          <span data-course-parity className="block text-[9px] leading-3 text-slate-500 md:hidden">
            {parityLabel}
          </span>
        )}
        {showClassroom && (
          <span className="mt-0.5 block break-all text-[10px] leading-3.5 text-slate-600 md:truncate md:text-xs md:leading-5">
            {course.classroom}
          </span>
        )}
        {showTeacher && <span className="block break-all text-[10px] leading-3.5 text-slate-600 md:hidden">{course.teacher}</span>}
        {showNote && (
          <span className="mt-auto block break-all pl-0 text-[10px] leading-3.5 text-slate-600/90 md:truncate md:pl-1 md:text-xs md:leading-[18px]">
            {note || (
              <span className="hidden text-slate-400 transition-opacity md:inline md:opacity-0 md:group-hover:opacity-100">
                点击查看详情
              </span>
            )}
          </span>
        )}
      </span>
      <span
        className={cn(
          'absolute bottom-0.5 right-0.5 rounded-sm bg-white/70 md:static md:mt-0.5 md:shrink-0 md:bg-transparent',
          isAttended ? 'text-emerald-600' : 'text-rose-600'
        )}
      >
        {isAttended ? <CheckCircle2 className="size-3 md:size-4" /> : <CircleAlert className="size-3 md:size-4" />}
      </span>
    </button>
  )
}
