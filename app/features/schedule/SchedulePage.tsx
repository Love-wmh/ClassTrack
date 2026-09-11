import { useEffect, useMemo, useState } from 'react'
import ImportDialog from '~/components/dialog/ImportDialog'
import { useClassStore } from '~/store'
import ScheduleEmptyState from './ScheduleEmptyState'
import ScheduleHeader from './ScheduleHeader'
import ScheduleTable from './ScheduleTable'
import ScheduleCourseDialog from './ScheduleCourseDialog'
import { getCurrentRealWeek, getMaxWeek } from './utils'
import { useWeekAttendance } from './hooks/useWeekAttendance'
import { useWeekKeyboardNavigation } from './hooks/useWeekKeyboardNavigation'

export default function SchedulePage() {
  const {
    classes,
    classMarks,
    currentWeek,
    isInitialized,
    school,
    setShowImportDialog,
    toggleAttendance,
    setNote,
    setCurrentWeek,
    firstWeekStartDate,
  } = useClassStore()

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)

  useEffect(() => {
    if (!isInitialized) {
      if (!school) {
        setShowImportDialog(true)
      }
    } else if (classes.length === 0) {
      setShowImportDialog(true)
    }
  }, [isInitialized, school, classes.length, setShowImportDialog])

  const weekClasses = useMemo(() => classes.filter((classItem) => classItem.weeks.includes(currentWeek)), [classes, currentWeek])

  const maxWeek = useMemo(() => getMaxWeek(classes), [classes])
  const currentRealWeek = useMemo(() => getCurrentRealWeek(classes, firstWeekStartDate), [classes, firstWeekStartDate])

  useWeekKeyboardNavigation({ currentWeek, maxWeek, onWeekChange: setCurrentWeek })

  const { markAllAsAttended, markAllAsUnattended } = useWeekAttendance()

  const selectedCourse = weekClasses.find((classItem) => classItem.id === selectedCourseId) || null
  const selectedMark = selectedCourse ? classMarks[`${selectedCourse.id}-${currentWeek}`] : undefined

  if (!isInitialized || !school || classes.length === 0) {
    return <ScheduleEmptyState school={school} hasClasses={classes.length > 0} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background px-3 pb-3 pt-3 sm:px-5 sm:py-6 md:pb-6">
      <ImportDialog />

      <div className="mx-auto flex min-h-0 w-full max-w-[1410px] flex-1 flex-col">
        <ScheduleHeader
          currentWeek={currentWeek}
          maxWeek={maxWeek}
          currentRealWeek={currentRealWeek}
          onWeekChange={setCurrentWeek}
          onMarkAllAsAttended={markAllAsAttended}
          onMarkAllAsUnattended={markAllAsUnattended}
        />
        <ScheduleTable
          weekClasses={weekClasses}
          classMarks={classMarks}
          currentWeek={currentWeek}
          firstWeekStartDate={firstWeekStartDate}
          onCourseClick={(course) => setSelectedCourseId(course.id)}
        />
      </div>
      <ScheduleCourseDialog
        key={`${selectedCourse?.id || 'none'}-${currentWeek}-${selectedMark?.note || ''}`}
        course={selectedCourse}
        currentWeek={currentWeek}
        mark={selectedMark}
        open={selectedCourse !== null}
        onOpenChange={(open) => !open && setSelectedCourseId(null)}
        onToggleAttendance={toggleAttendance}
        onSaveNote={setNote}
      />
    </div>
  )
}
