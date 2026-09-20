import { format } from 'date-fns'
import { Minus, Plus } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useIsMobile } from '~/hooks/use-mobile'
import type { Class, ClassMark } from '~/lib/types'
import { getMarkKey } from '~/store/utils'
import { cn } from '~/lib/utils'
import { dayNames, sections, weekDays } from './constants'
import ScheduleCourseCell from './ScheduleCourseCell'
import { useScheduleZoom } from './hooks/useScheduleZoom'
import { getDayDate } from './utils'
import type { SectionTime } from './utils'

type ScheduleTableProps = {
  weekClasses: Class[]
  classMarks: Record<string, ClassMark>
  currentWeek: number
  firstWeekStartDate: string | null
  sectionTimes: Record<number, SectionTime>
  onCourseClick: (course: Class) => void
}

export default function ScheduleTable({
  weekClasses,
  classMarks,
  currentWeek,
  firstWeekStartDate,
  sectionTimes,
  onCourseClick,
}: ScheduleTableProps) {
  const isMobile = useIsMobile()
  const { zoom, detailLevel, scrollRef, gridRef, containerProps, zoomIn, zoomOut, canZoomIn, canZoomOut } = useScheduleZoom()
  const showClassroom = isMobile ? detailLevel !== 'compact' : true
  const showTeacher = isMobile && detailLevel === 'full'
  const showNote = isMobile ? detailLevel === 'full' : true

  const monthDate = getDayDate(firstWeekStartDate, currentWeek, 1)
  const getClassMark = (classId: string, week: number) => classMarks[getMarkKey(classId, week)]
  const occupiedCells = new Set(
    weekClasses.flatMap((course) => {
      const cells: string[] = []
      for (let section = course.startSection; section <= course.endSection; section += 1) {
        cells.push(`${course.dayOfWeek}-${section}`)
      }
      return cells
    })
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
          className="grid h-full min-w-[calc(100%*var(--schedule-zoom,1))] grid-cols-[2rem_repeat(7,minmax(0,1fr))] grid-rows-[2.25rem_repeat(12,minmax(2.75rem,1fr))] md:min-w-[760px] md:grid-cols-[4rem_repeat(7,minmax(0,1fr))]"
          style={{ '--schedule-zoom': String(zoom) } as CSSProperties}
        >
          <div className="sticky left-0 z-30 flex items-center justify-center border-b border-r border-border bg-muted text-[10px] font-medium text-muted-foreground shadow-[2px_0_4px_rgb(0_0_0_/_0.06)] md:text-sm">
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
                  'flex flex-col items-center justify-center border-b border-border bg-muted/60 text-[11px] font-medium leading-4 text-muted-foreground md:flex-row md:text-sm',
                  day !== 7 && 'border-r'
                )}
              >
                <span>{dayNames[day]}</span>
                {date && (
                  <span className="text-[9px] font-normal leading-3 md:ml-1.5 md:text-xs md:leading-5">{format(date, 'MM.dd')}</span>
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
                  'sticky left-0 z-20 flex flex-col items-center justify-center border-r border-border bg-card text-sm font-medium text-muted-foreground shadow-[2px_0_4px_rgb(0_0_0_/_0.06)] md:text-base',
                  section !== 12 && 'border-b'
                )}
                style={{ gridColumn: 1, gridRow: section + 1 }}
              >
                <span>{section}</span>
                {sectionTime?.start && <span className="text-[9px] font-normal leading-3 tabular-nums md:hidden">{sectionTime.start}</span>}
                {sectionTime?.end && <span className="text-[9px] font-normal leading-3 tabular-nums md:hidden">{sectionTime.end}</span>}
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

          {weekClasses.map((course) => (
            <div
              key={course.id}
              className={cn(
                'min-h-0 overflow-hidden border-border',
                course.dayOfWeek !== 7 && 'border-r',
                course.endSection !== 12 && 'border-b'
              )}
              style={{
                gridColumn: course.dayOfWeek + 1,
                gridRow: `${course.startSection + 1} / ${course.endSection + 2}`,
              }}
            >
              <ScheduleCourseCell
                course={course}
                mark={getClassMark(course.id, currentWeek)}
                showClassroom={showClassroom}
                showTeacher={showTeacher}
                showNote={showNote}
                onClick={() => onCourseClick(course)}
              />
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
          <span className="min-w-7 text-center text-[10px] tabular-nums text-muted-foreground">{zoom}x</span>
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
