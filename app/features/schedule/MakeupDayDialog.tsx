import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Check } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { DatePicker } from '~/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import type { Class } from '~/lib/types'
import { cn } from '~/lib/utils'
import { dayNames } from './constants'
import { getCoursesOnDate } from './makeupLesson'

type MakeupDayDialogProps = {
  open: boolean
  /** 目标星期（当前周的这一天）；为空时不渲染内容。 */
  targetDayOfWeek: number | null
  currentWeek: number
  /** 目标星期在当前周对应的自然日期，用于标题展示；可能为空（未设开学日期）。 */
  targetDate: Date | null
  classes: Class[]
  firstWeekStartDate: string | null
  onOpenChange: (open: boolean) => void
  /** 确认后把选中的「源课程」整批补到目标星期。 */
  onConfirm: (sourceCourses: Class[]) => void
}

/**
 * 「按日期把一整天的课补到某一天」的弹窗。
 *
 * 从列头（周几）唤起：先选一个源日期 → 列出那天的全部课程 → 勾选要补的（默认全选）→ 一键补到目标星期。
 * 节次保持与源课程一致，落位冲突由上层 `planDayMakeup` 跳过。
 */
export default function MakeupDayDialog(props: MakeupDayDialogProps) {
  const { open, targetDayOfWeek, onOpenChange } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-lg p-4 md:max-w-md md:p-6">
        {targetDayOfWeek !== null && <MakeupDayDialogBody key={targetDayOfWeek} {...props} targetDayOfWeek={targetDayOfWeek} />}
      </DialogContent>
    </Dialog>
  )
}

function MakeupDayDialogBody({
  targetDayOfWeek,
  currentWeek,
  targetDate,
  classes,
  firstWeekStartDate,
  onOpenChange,
  onConfirm,
}: MakeupDayDialogProps & { targetDayOfWeek: number }) {
  const [sourceDate, setSourceDate] = useState<Date | undefined>(undefined)
  // 取消勾选的课程 id；默认全选，所以这里存「被排除的」更省事。
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

  const sourceCourses = useMemo(
    () => (sourceDate ? getCoursesOnDate(classes, firstWeekStartDate, sourceDate) : []),
    [classes, firstWeekStartDate, sourceDate]
  )
  const selectedCourses = sourceCourses.filter((course) => !excludedIds.has(course.id))

  const handlePickDate = (date: Date | undefined) => {
    setSourceDate(date)
    setExcludedIds(new Set())
  }

  const toggleCourse = (courseId: string) => {
    setExcludedIds((previous) => {
      const next = new Set(previous)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      return next
    })
  }

  const targetLabel = `${dayNames[targetDayOfWeek]}${targetDate ? ` ${format(targetDate, 'M月d日')}` : ''}`

  return (
    <div className="flex max-h-[calc(100dvh-6rem)] flex-col gap-4 md:max-h-[72vh]">
      <DialogHeader className="pr-8 text-left">
        <DialogTitle className="text-lg">补课到 {targetLabel}</DialogTitle>
        <DialogDescription>
          选择一个日期，把那天的课补到第 {currentWeek} 周的 {dayNames[targetDayOfWeek]}。
        </DialogDescription>
      </DialogHeader>

      {!firstWeekStartDate ? (
        <p className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
          需要先在「个人中心」设置开学日期，才能按日期把当天课程补过来。
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">源日期</span>
            <DatePicker date={sourceDate} onSelect={handlePickDate} placeholder="选择要补哪天的课" className="w-full" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!sourceDate ? (
              <p className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">选择源日期后，这里会列出那天的全部课程。</p>
            ) : sourceCourses.length === 0 ? (
              <p className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
                {format(sourceDate, 'M月d日', { locale: zhCN })} 没有可补的课程。
              </p>
            ) : (
              <div className="-mx-1 space-y-1 px-1">
                {sourceCourses.map((course) => {
                  const isSelected = !excludedIds.has(course.id)
                  return (
                    <button
                      key={course.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleCourse(course.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                        isSelected ? 'border-primary bg-primary/5' : 'border-border opacity-60 hover:opacity-100'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border',
                          isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                        )}
                      >
                        {isSelected && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{course.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          第 {course.startSection}
                          {course.startSection === course.endSection ? '' : `-${course.endSection}`} 节
                          {course.classroom ? ` · ${course.classroom}` : ''}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      <DialogFooter className="grid grid-cols-2 gap-2 md:flex">
        <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          type="button"
          className="min-h-11 md:min-h-9"
          onClick={() => onConfirm(selectedCourses)}
          disabled={selectedCourses.length === 0}
        >
          补过来{selectedCourses.length > 0 ? `（${selectedCourses.length}）` : ''}
        </Button>
      </DialogFooter>
    </div>
  )
}
