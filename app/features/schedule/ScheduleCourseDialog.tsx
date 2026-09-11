import { useState } from 'react'
import { CheckCircle2, CircleAlert, Clock3, MapPin, UserRound } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Textarea } from '~/components/ui/textarea'
import type { Class, ClassMark } from '~/lib/types'

type ScheduleCourseDialogProps = {
  course: Class | null
  currentWeek: number
  mark: ClassMark | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleAttendance: (classId: string, week: number) => void
  onSaveNote: (classId: string, week: number, note: string) => void
}

export default function ScheduleCourseDialog({
  course,
  currentWeek,
  mark,
  open,
  onOpenChange,
  onToggleAttendance,
  onSaveNote,
}: ScheduleCourseDialogProps) {
  const [note, setNote] = useState('')

  if (!course) return null

  const isAttended = Boolean(mark?.isAttended)
  const handleSave = () => {
    onSaveNote(course.id, currentWeek, note.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-lg p-4 sm:max-w-md sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-xl leading-7">{course.name}</DialogTitle>
          <DialogDescription>
            第 {currentWeek} 周 ·{' '}
            {course.startSection === course.endSection
              ? `第 ${course.startSection} 节`
              : `第 ${course.startSection}-${course.endSection} 节`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          {course.teacher && (
            <div className="flex items-center gap-2">
              <UserRound className="size-4 shrink-0" />
              <span className="break-words">{course.teacher}</span>
            </div>
          )}
          {course.classroom && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" />
              <span className="break-words">{course.classroom}</span>
            </div>
          )}
          {(course.startTime || course.endTime) && (
            <div className="flex items-center gap-2">
              <Clock3 className="size-4 shrink-0" />
              <span>{[course.startTime, course.endTime].filter(Boolean).join(' - ')}</span>
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          className={
            isAttended
              ? 'min-h-12 justify-start border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'min-h-12 justify-start border-rose-300 bg-rose-50 text-rose-800'
          }
          onClick={() => onToggleAttendance(course.id, currentWeek)}
        >
          {isAttended ? <CheckCircle2 /> : <CircleAlert />}
          {isAttended ? '已上课，点击切换为未上' : '未上课，点击切换为已上'}
        </Button>

        <div className="space-y-2">
          <label htmlFor="schedule-course-note" className="text-sm font-medium">
            本次课程备注
          </label>
          <Textarea
            id="schedule-course-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="记录代课、调课或其他事项…"
            className="min-h-32 resize-y"
          />
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" className="min-h-11 sm:min-h-9" onClick={handleSave}>
            保存备注
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
