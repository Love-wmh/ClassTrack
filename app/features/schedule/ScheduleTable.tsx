import { format } from 'date-fns'
import { Minus, Plus } from 'lucide-react'
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useIsMobile } from '~/hooks/use-mobile'
import type { Class, ClassMark } from '~/lib/types'
import { getMarkKey } from '~/store/utils'
import { useScheduleDisplayStore } from '~/store/scheduleDisplayStore'
import { cn } from '~/lib/utils'
import { CELL_CONTAINER_CLASS, GRID_CONTAINER_CLASS, cellScaleStyle } from './cellScale'
import { dayNames, sections, weekDays } from './constants'
import ScheduleCourseCell from './ScheduleCourseCell'
import { useScheduleZoom } from './hooks/useScheduleZoom'
import { getDayDate } from './utils'
import type { SectionTime, VisibleCourse } from './utils'

type ScheduleTableProps = {
  visibleCourses: VisibleCourse[]
  classMarks: Record<string, ClassMark>
  /** 「出勤统计」是否开启；关闭时课程格不画出勤痕迹（备注照常显示）。 */
  attendanceEnabled: boolean
  currentWeek: number
  firstWeekStartDate: string | null
  sectionTimes: Record<number, SectionTime>
  onCourseClick: (course: Class) => void
}

/** 「收起整周无课的日期列」时，无课列的轨道：`1.75rem` 是最小列宽保护，保证「周六 + 10.03」仍放得下。 */
const COLLAPSED_DAY_TRACK = 'minmax(1.75rem, 0.45fr)'
const BUSY_DAY_TRACK = 'minmax(0, 1fr)'

export default function ScheduleTable({
  visibleCourses,
  classMarks,
  attendanceEnabled,
  currentWeek,
  firstWeekStartDate,
  sectionTimes,
  onCourseClick,
}: ScheduleTableProps) {
  const isMobile = useIsMobile()
  const { zoom, detailLevel, scrollRef, gridRef, containerProps, zoomIn, zoomOut, canZoomIn, canZoomOut } = useScheduleZoom()

  const collapseEmptyWeekdayColumns = useScheduleDisplayStore((state) => state.collapseEmptyWeekdayColumns)

  const monthDate = getDayDate(firstWeekStartDate, currentWeek, 1)
  const getClassMark = (classId: string, week: number) => classMarks[getMarkKey(classId, week)]
  const occupiedCells = new Set(
    visibleCourses.flatMap(({ course }) => {
      const cells: string[] = []
      for (let section = course.startSection; section <= course.endSection; section += 1) {
        cells.push(`${course.dayOfWeek}-${section}`)
      }
      return cells
    })
  )

  // 判定用 `visibleCourses` 而不是 `classes`：开启「淡化显示非本周课程」时，非本周课也占格，
  // 那一列就不算「整周无课」。全周都没课时不折叠（没有任何一列可以把宽度让出去）。
  const busyDays = useMemo(() => new Set(visibleCourses.map((entry) => entry.course.dayOfWeek)), [visibleCourses])
  const collapseColumns = collapseEmptyWeekdayColumns && busyDays.size > 0 && busyDays.size < 7

  // 列模板必须走内联样式（要逐列不同 + 带 minmax 下限），因此节次列的 2rem/4rem 也只能由 JS 给：
  // 内联的 grid-template-columns 会整体覆盖 class 上的断点版本。
  const gridTemplateColumns = useMemo(() => {
    const sectionTrack = isMobile ? '2rem' : '4rem'
    const dayTracks = weekDays.map((day) => (busyDays.has(day) ? BUSY_DAY_TRACK : COLLAPSED_DAY_TRACK))
    return [sectionTrack, ...dayTracks].join(' ')
  }, [isMobile, busyDays])

  const gridStyle = useMemo(
    () =>
      ({
        '--schedule-zoom': String(zoom),
        ...cellScaleStyle,
        ...(collapseColumns ? { gridTemplateColumns } : null),
      }) as CSSProperties,
    [zoom, collapseColumns, gridTemplateColumns]
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        data-schedule-scroll
        {...containerProps}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain rounded-md border border-border bg-card shadow-xs [touch-action:pan-x_pan-y]"
      >
        <div
          ref={gridRef}
          data-schedule-grid
          data-zoom-level={zoom}
          data-zoom-tier={detailLevel}
          className={cn(
            'grid h-full min-w-[calc(100%*var(--schedule-zoom,1))] grid-rows-[2.25rem_repeat(12,minmax(3.875rem,1fr))] md:min-w-[760px]',
            GRID_CONTAINER_CLASS,
            // 关闭开关时列模板与历史实现逐字符一致（手机 2rem 节次列 / 桌面 4rem 节次列 + 7 个等宽列），
            // 由 class 提供；开启时改由内联样式给出，这两条 class 直接不参与。
            !collapseColumns && 'grid-cols-[2rem_repeat(7,minmax(0,1fr))] md:grid-cols-[4rem_repeat(7,minmax(0,1fr))]'
          )}
          style={gridStyle}
        >
          <div className="sticky left-0 z-30 flex items-center justify-center border-b border-r border-border bg-muted font-medium text-muted-foreground shadow-[2px_0_4px_rgb(0_0_0_/_0.06)] [font-size:var(--cc-month)]">
            <span className="md:hidden">{monthDate ? format(monthDate, 'M月') : '节'}</span>
            <span className="hidden md:inline">节</span>
          </div>
          {weekDays.map((day) => {
            const date = getDayDate(firstWeekStartDate, currentWeek, day)
            return (
              <div
                key={day}
                data-day-head
                className={cn(
                  'flex flex-col items-center justify-center border-b border-border bg-muted/60 font-medium text-muted-foreground md:flex-row',
                  day !== 7 && 'border-r'
                )}
              >
                <span className="[font-size:var(--cc-head)] [line-height:1.2]">{dayNames[day]}</span>
                {date && (
                  <span className="font-normal [font-size:var(--cc-head-sub)] [line-height:1.2] md:ml-1.5">{format(date, 'MM.dd')}</span>
                )}
              </div>
            )
          })}

          {sections.map((section) => {
            const sectionTime = sectionTimes[section]
            return (
              <div
                key={`section-${section}`}
                data-section-row={section}
                className={cn(
                  'sticky left-0 z-20 flex flex-col items-center justify-center border-r border-border bg-card font-medium text-muted-foreground shadow-[2px_0_4px_rgb(0_0_0_/_0.06)]',
                  section !== 12 && 'border-b'
                )}
                style={{ gridColumn: 1, gridRow: section + 1 }}
              >
                <span className="[font-size:var(--cc-section-no)]">{section}</span>
                {sectionTime?.start && (
                  <span className="font-normal tabular-nums [font-size:var(--cc-section-time)] [line-height:1.2] md:hidden">
                    {sectionTime.start}
                  </span>
                )}
                {sectionTime?.end && (
                  <span className="font-normal tabular-nums [font-size:var(--cc-section-time)] [line-height:1.2] md:hidden">
                    {sectionTime.end}
                  </span>
                )}
              </div>
            )
          })}

          {weekDays.flatMap((day) =>
            sections.map((section) => {
              if (occupiedCells.has(`${day}-${section}`)) return null

              return (
                <div
                  key={`empty-${day}-${section}`}
                  className={cn(day !== 7 && 'border-r', section !== 12 && 'border-b', 'border-border')}
                  style={{ gridColumn: day + 1, gridRow: section + 1 }}
                />
              )
            })
          )}

          {visibleCourses.map(({ course, isOutOfWeek }) => (
            // 外层是**查询容器**：它故意不带任何内边距/边框，内容盒因此恰好等于网格给的这块区域。
            // 内边距（`p-px`）与网格线（`border-r`/`border-b`）在最后一列/最后一行会缺一条边，
            // 若把它们放在带 `container-type` 的这层上，容器内容盒就会随「这是不是最后一列」变化，
            // 同尺寸格子的字号立刻不一致（见 cellScale.ts 的 CELL_CONTAINER_CLASS 注释）。
            <div
              key={course.id}
              data-course-wrapper
              className={cn('min-h-0 overflow-hidden', CELL_CONTAINER_CLASS)}
              style={{
                gridColumn: course.dayOfWeek + 1,
                gridRow: `${course.startSection + 1} / ${course.endSection + 2}`,
              }}
            >
              <div
                className={cn(
                  'h-full w-full overflow-hidden border-border p-px',
                  course.dayOfWeek !== 7 && 'border-r',
                  course.endSection !== 12 && 'border-b'
                )}
              >
                <ScheduleCourseCell
                  course={course}
                  mark={getClassMark(course.id, currentWeek)}
                  attendanceEnabled={attendanceEnabled}
                  isOutOfWeek={isOutOfWeek}
                  onClick={() => onCourseClick(course)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {isMobile && (
        <div
          data-schedule-zoom-control
          className="absolute bottom-2 right-2 z-30 flex items-center gap-0.5 rounded-md border border-border bg-card/95 px-1 py-1 shadow-xs"
        >
          <button
            type="button"
            aria-label="缩小课表"
            onClick={zoomOut}
            disabled={!canZoomOut}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-7 text-center text-xs tabular-nums text-muted-foreground">{zoom}x</span>
          <button
            type="button"
            aria-label="放大课表"
            onClick={zoomIn}
            disabled={!canZoomIn}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
