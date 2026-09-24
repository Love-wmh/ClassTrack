import { useLayoutEffect, useRef } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { useIsMobile } from '~/hooks/use-mobile'
import type { Class, ClassMark } from '~/lib/types'
import { cn } from '~/lib/utils'
import { useScheduleDisplayStore } from '~/store/scheduleDisplayStore'
import { getCourseColor, getCourseOutOfWeekColor, getWeekParityLabel } from './utils'

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
  onClick: () => void
}

export default function ScheduleCourseCell({ course, mark, attendanceEnabled, isOutOfWeek, onClick }: ScheduleCourseCellProps) {
  const isMobile = useIsMobile()
  const showAttendanceStatus = useScheduleDisplayStore((state) => state.showAttendanceStatus)
  const isAttended = !!mark?.isAttended
  const note = mark?.note || ''
  const parityLabel = isOutOfWeek ? '非本周' : getWeekParityLabel(course.weeks)
  const courseColor = getCourseColor(course.courseId)
  const courseOutOfWeekColor = getCourseOutOfWeekColor(course.courseId)
  // 出勤痕迹要同时满足「出勤统计已开启」与「用户在课表显示里没关掉它」，且只针对本周课：
  // 非本周课一般没有当周标记，灰色态优先，不再叠加未上淡化。
  const showAttendance = attendanceEnabled && showAttendanceStatus && !isOutOfWeek

  const contentRef = useRef<HTMLSpanElement>(null)
  const blockRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const roomRef = useRef<HTMLSpanElement>(null)
  const parityRef = useRef<HTMLSpanElement>(null)
  const teacherRef = useRef<HTMLSpanElement>(null)
  const noteRef = useRef<HTMLSpanElement>(null)

  /**
   * 按格子实际可用高度决定可选行显示到哪一级。
   *
   * 课名与教室是硬要求：任何尺寸、任何缩放档位下都必须完整可见。其余三行是弹性内容，
   * 纯 CSS 的高度阈值区分不出「同样高度、课名长短差很多」的格子（20 字课名要占 7 行，
   * 3 字课名只占 1 行，两者格高相同），所以这里实测一次内容高度，再按
   * **单双周/非本周标签 → 教师 → 备注** 的顺序从低到高整行丢弃，直到放得下为止 ——
   * 只整行隐藏，绝不出现被裁掉半截的文字；若整行都丢完仍放不下（例如只有一节的矮格遇上超长课名），
   * 再按需收小课名与教室的字号兜底，保证这两行始终完整。
   *
   * 直接写 `style.display` 而不是 setState：测量与渲染不会互相触发，也不会每格多渲染一次。
   * 单双周标签在桌面端本就由 `md:hidden` 隐藏（见下方 class），这里只在手机端把它纳入丢弃序列。
   */
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return

    const apply = () => {
      const name = nameRef.current
      const room = roomRef.current
      const block = blockRef.current
      // 每轮都从基准状态重新测量：先清掉上一轮的内联覆盖，让 class 上的断点规则与字号重新生效。
      for (const el of [parityRef.current, teacherRef.current, noteRef.current]) {
        if (el) el.style.display = ''
      }
      if (name) {
        name.style.fontSize = ''
        name.style.lineHeight = ''
      }
      if (room) {
        room.style.fontSize = ''
        room.style.lineHeight = ''
      }
      if (block) block.style.width = ''

      const fits = () => content.scrollHeight <= content.clientHeight + 1
      const parity = isMobile ? parityRef.current : null
      const teacher = teacherRef.current
      const note = noteRef.current

      for (const el of [parity, teacher, note]) {
        if (el) el.style.display = 'block'
      }
      // 优先级从低到高逐个丢弃：备注 → 教师 → 单双周标签。
      for (const el of [note, teacher, parity]) {
        if (!el) continue
        if (fits()) break
        el.style.display = ''
      }

      // 极端兜底：课名与教室不能丢，只能收字号与行高（最多两档，避免小到不可读）。
      if (!fits() && (name || room)) {
        const baseName = isMobile ? 10 : 14
        const baseRoom = isMobile ? 9 : 12
        for (let step = 1; step <= 2; step += 1) {
          if (name) {
            name.style.fontSize = `${baseName - step}px`
            name.style.lineHeight = '1.05'
          }
          if (room) {
            room.style.fontSize = `${baseRoom - step}px`
            room.style.lineHeight = '1.05'
          }
          if (fits()) break
        }
      }

      // 文字块在卡片里居中、块内文字仍左对齐：把内层块收窄到「实际用到的最大行宽」，
      // 再由外层 `items-center` 居中。逐行 `text-center` 会把每行都居中，长课名反而更难读。
      if (!block) return
      let used = 0
      for (const el of [parity, name, room, teacher, note]) {
        if (!el || el.style.display === 'none' || getComputedStyle(el).display === 'none') continue
        const range = document.createRange()
        range.selectNodeContents(el)
        for (const rect of range.getClientRects()) {
          if (rect.height > 1) used = Math.max(used, rect.width)
        }
      }
      if (used <= 0) return
      block.style.width = `${Math.ceil(used)}px`
      // 收窄后若换行变多、放不下，就退回整宽——宁可偏左，也绝不裁字。
      if (!fits()) block.style.width = ''
    }

    let cancelled = false
    const measure = () => {
      if (!cancelled) apply()
    }

    apply()

    // 首帧测完还不够可靠：挂载那一刻网格行高常常还没被 1fr 分配定稿（量到的是内容自然高，
    // 于是误判「放得下」），中文字体也可能晚到改变换行；两者都不会触发按钮尺寸变化，
    // 只靠 ResizeObserver 会一直用错误的结论，表现为长课名格子溢出被裁。
    // 所以补两拍：下一帧、以及字体就绪后各重测一次。
    const raf = requestAnimationFrame(measure)
    void document.fonts?.ready.then(measure)

    // 格子尺寸由网格与缩放决定（内容改动不会改变外层按钮尺寸），因此观察外层按钮即可在
    // 缩放、旋屏、窗口尺寸变化后重新测量。
    const target = content.parentElement ?? content
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  })

  return (
    <button
      type="button"
      data-course-cell
      {...(isOutOfWeek ? { 'data-course-out-of-week': '' } : {})}
      className={cn(
        'group relative flex h-full min-h-0 w-full cursor-pointer flex-col overflow-hidden rounded-md px-1.5 py-1 text-left ring-2 ring-white/55 ring-inset transition-opacity focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-lg md:px-2 md:py-2',
        isOutOfWeek ? courseOutOfWeekColor : courseColor,
        showAttendance && !isAttended && 'opacity-60 saturate-50'
      )}
      onClick={onClick}
      title={`${course.name}${showAttendance ? `，${isAttended ? '已上' : '未上'}` : ''}${isOutOfWeek ? '，非本周' : ''}，点击查看详情`}
    >
      <span ref={contentRef} className="flex min-h-0 flex-1 flex-col items-center [justify-content:safe_center]">
        <span ref={blockRef} className="block text-left">
          <span
            ref={nameRef}
            data-course-name
            className="block break-words text-[10px] font-semibold leading-[1.2] text-white md:text-sm md:leading-5"
          >
            {course.name}
          </span>
          {parityLabel && (
            <span ref={parityRef} data-course-parity className="hidden text-[9px] leading-3 text-white/70 md:hidden">
              {parityLabel}
            </span>
          )}
          {course.classroom && (
            <span ref={roomRef} className="mt-0.5 block break-words text-[9px] leading-3 text-white/85 md:text-xs md:leading-5">
              {course.classroom}
            </span>
          )}
          {course.teacher && (
            <span ref={teacherRef} className="hidden break-all text-[9px] leading-3 text-white/80 md:text-xs md:leading-5">
              {course.teacher}
            </span>
          )}
          <span ref={noteRef} className="hidden break-all text-[9px] leading-3 text-white/70 md:truncate md:text-xs md:leading-[18px]">
            {note || (
              <span className="hidden text-white/60 transition-opacity md:inline md:opacity-0 md:group-hover:opacity-100">
                点击查看详情
              </span>
            )}
          </span>
        </span>
      </span>
      {showAttendance && (
        <span className="absolute bottom-1 right-1 text-white/90">
          {isAttended ? <CheckCircle2 className="size-3 md:size-4" /> : <CircleAlert className="size-3 md:size-4" />}
        </span>
      )}
    </button>
  )
}
