import { useEffect, useMemo, useState } from 'react'
import ImportDialog from '~/components/dialog/ImportDialog'
import { useClassStore } from '~/store'
import ScheduleEmptyState from './ScheduleEmptyState'
import ScheduleHeader from './ScheduleHeader'
import ScheduleTable from './ScheduleTable'
import { getCurrentRealWeek, getMaxWeek } from './utils'
import { useWeekAttendance } from './hooks/useWeekAttendance'
import { useWeekKeyboardNavigation } from './hooks/useWeekKeyboardNavigation'

type EditingNote = {
  id: string
  week: number
}

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

  const [editingNote, setEditingNote] = useState<EditingNote | null>(null)
  const [noteText, setNoteText] = useState('')

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

  const handleStartEditingNote = (editingNote: EditingNote, note: string) => {
    setEditingNote(editingNote)
    setNoteText(note)
  }

  const handleSaveNote = () => {
    if (editingNote) {
      setNote(editingNote.id, editingNote.week, noteText)
      setEditingNote(null)
      setNoteText('')
    }
  }

  if (!isInitialized || !school || classes.length === 0) {
    return <ScheduleEmptyState school={school} hasClasses={classes.length > 0} />
  }

  return (
    <div className="h-full overflow-auto bg-background px-5 py-6">
      <ImportDialog />

      <div className="mx-auto max-w-[1410px]">
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
          editingNote={editingNote}
          noteText={noteText}
          onToggleAttendance={toggleAttendance}
          onStartEditingNote={handleStartEditingNote}
          onNoteTextChange={setNoteText}
          onSaveNote={handleSaveNote}
        />
      </div>
    </div>
  )
}
