import { CheckCircle2, CircleAlert } from 'lucide-react'
import type { Class, ClassMark } from '~/lib/types'
import { cn } from '~/lib/utils'
import { useScheduleDisplayStore } from '~/store/scheduleDisplayStore'
import { getCourseColor, getWeekParityLabel } from './utils'

type ScheduleCourseCellProps = {
  course: Class
  mark: ClassMark | undefined
  /**
   * 「出勤统计」是否开启（个人中心的开关）。
   *
   * 关闭时这一格不出现任何已上/未上痕迹（打勾角标、未上淡化与 title 文案），
   * **但备注照常显示** —— 备注与出勤共用同一条 `ClassMark`，却是两件事。
   */
  attendanceEnabled: boolean
  /** 非本周课程（开启「淡化显示非本周课程」时才会出现在格子里）。 */
  isOutOfWeek: boolean
  /** 缩放 full 档（2x）时强制显示教师行（容器查询之外的兜底）。 */
  showTeacher: boolean
  /** 缩放 full 档（2x）时强制显示备注行（容器查询之外的兜底）。 */
  showNote: boolean
  onClick: () => void
}

export default function ScheduleCourseCell({
  course,
  mark,
  attendanceEnabled,
  isOutOfWeek,
  showTeacher,
  showNote,
  onClick,
}: ScheduleCourseCellProps) {
  const showAttendanceStatus = useScheduleDisplayStore((state) => state.showAttendanceStatus)
  const isAttended = !!mark?.isAttended
  const note = mark?.note || ''
  const parityLabel = isOutOfWeek ? '非本周' : getWeekParityLabel(course.weeks)
  const courseColor = getCourseColor(course.courseId)
  // 出勤痕迹要同时满足「出勤统计已开启」与「用户在课表显示里没关掉它」，且只针对本周课：
  // 非本周课一般没有当周标记，灰色态优先，不再叠加未上淡化。
  const showAttendance = attendanceEnabled && showAttendanceStatus && !isOutOfWeek

  return (
    <button
      type="button"
      data-course-cell
      {...(isOutOfWeek ? { 'data-course-out-of-week': '' } : {})}
      className={cn(
        'group relative flex h-full min-h-0 w-full cursor-pointer flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-left shadow-xs ring-1 ring-inset ring-white/25 transition-opacity focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-lg md:px-2 md:py-1.5',
        isOutOfWeek ? 'bg-gradient-to-b from-slate-300 to-slate-400 opacity-75' : courseColor,
        showAttendance && !isAttended && 'opacity-60 saturate-50'
      )}
      onClick={onClick}
      title={`${course.name}${showAttendance ? `，${isAttended ? '已上' : '未上'}` : ''}${isOutOfWeek ? '，非本周' : ''}，点击查看详情`}
    >
      <span className="flex min-h-0 flex-1 flex-col">
        <span data-course-name className="block text-[10px] font-semibold leading-[1.2] text-white md:text-sm md:leading-5">
          {course.name}
        </span>
        {parityLabel && (
          <span data-course-parity className="block text-[9px] leading-3 text-white/70 [@container(max-height:4rem)]:hidden md:hidden">
            {parityLabel}
          </span>
        )}
        {course.classroom && (
          <span className="mt-0.5 block break-all text-[9px] leading-3 text-white/85 md:text-xs md:leading-5">@{course.classroom}</span>
        )}
        {course.teacher && (
          <span
            className={cn(
              'hidden break-all text-[9px] leading-3 text-white/80 [@container(min-height:7.5rem)]:block md:text-xs md:leading-5 md:[@container(min-height:6.5rem)]:block',
              showTeacher && 'block'
            )}
          >
            {course.teacher}
          </span>
        )}
        <span
          className={cn(
            'mt-auto hidden break-all text-[9px] leading-3 text-white/70 [@container(min-height:9rem)]:block md:truncate md:text-xs md:leading-[18px]',
            showNote && 'block'
          )}
        >
          {note || (
            <span className="hidden text-white/60 transition-opacity md:inline md:opacity-0 md:group-hover:opacity-100">点击查看详情</span>
          )}
        </span>
      </span>
      {showAttendance && (
        <span className="absolute bottom-1 right-1 text-white/90 drop-shadow-sm">
          {isAttended ? <CheckCircle2 className="size-3 md:size-4" /> : <CircleAlert className="size-3 md:size-4" />}
        </span>
      )}
    </button>
  )
}
