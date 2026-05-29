import { useEffect, useMemo, useState } from 'react'
import SchoolSelectDialog from '~/components/dialog/SchoolSelectDialog'
import ImportDialog from '~/components/dialog/ImportDialog'
import { useClassStore } from '~/store'
import ScheduleEmptyState from './ScheduleEmptyState'
import ScheduleHeader from './ScheduleHeader'
import ScheduleTable from './ScheduleTable'
import { getCurrentWeek, getMaxWeek } from './utils'
import { useWeekAttendance } from './hooks/useWeekAttendance'

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
    setShowSchoolDialog,
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
        setShowSchoolDialog(true)
      }
    } else if (classes.length === 0) {
      setShowImportDialog(true)
    }
  }, [isInitialized, school, classes.length, setShowSchoolDialog, setShowImportDialog])

  const weekClasses = useMemo(() => classes.filter((classItem) => classItem.weeks.includes(currentWeek)), [classes, currentWeek])

  const maxWeek = useMemo(() => getMaxWeek(classes), [classes])
  const currentRealWeek = useMemo(() => getCurrentWeek(firstWeekStartDate, maxWeek), [firstWeekStartDate, maxWeek])

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
      <SchoolSelectDialog />
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
