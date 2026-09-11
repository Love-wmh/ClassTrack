import { CheckCircle2, CircleAlert } from 'lucide-react'
import type { Class, ClassMark } from '~/lib/types'
import { cn } from '~/lib/utils'
import { getCourseColor } from './utils'

type ScheduleCourseCellProps = {
  course: Class
  mark: ClassMark | undefined
  onClick: () => void
}

export default function ScheduleCourseCell({ course, mark, onClick }: ScheduleCourseCellProps) {
  const isAttended = !!mark?.isAttended
  const note = mark?.note || ''
  const courseColor = getCourseColor(course.courseId)

  return (
    <button
      type="button"
      className={cn(
        'group relative flex h-full min-h-0 w-full cursor-pointer flex-col overflow-hidden px-1.5 py-1 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2 sm:py-1.5',
        courseColor,
        isAttended ? 'ring-1 ring-inset ring-emerald-300/70' : 'ring-1 ring-inset ring-rose-300/70'
      )}
      onClick={onClick}
      title={`${course.name}，${isAttended ? '已上' : '未上'}，点击查看详情`}
    >
      <div className={cn('absolute left-0 top-0 h-full w-0.5', isAttended ? 'bg-emerald-500' : 'bg-rose-500')} />
      <div className="flex items-start justify-between gap-1 pl-1">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[11px] font-medium leading-4 text-slate-950 sm:text-sm sm:leading-5">{course.name}</div>
          <div className="mt-0.5 truncate text-[10px] leading-4 text-slate-600 sm:text-xs sm:leading-5">{course.classroom}</div>
        </div>
        <div className={cn('mt-0.5 shrink-0', isAttended ? 'text-emerald-600' : 'text-rose-600')}>
          {isAttended ? <CheckCircle2 className="size-3.5 sm:size-4" /> : <CircleAlert className="size-3.5 sm:size-4" />}
        </div>
      </div>

      <div className="mt-auto min-h-0 truncate pl-1 text-[10px] leading-4 text-slate-600/90 sm:text-xs sm:leading-[18px]">
        {note || <span className="text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">点击查看详情</span>}
      </div>
    </button>
  )
}
