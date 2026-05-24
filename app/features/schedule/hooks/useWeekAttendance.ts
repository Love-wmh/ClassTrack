import { useCallback } from 'react'
import { useClassStore } from '~/store'

export function useWeekAttendance() {
  const { classes, currentWeek, markWeekAsAttended, markWeekAsUnattended } = useClassStore()

  const weekClassIds = classes
    .filter((classItem) => classItem.weeks.includes(currentWeek))
    .map((c) => c.id)

  const handleMarkAllAsAttended = useCallback(() => {
    markWeekAsAttended(weekClassIds, currentWeek)
  }, [weekClassIds, currentWeek, markWeekAsAttended])

  const handleMarkAllAsUnattended = useCallback(() => {
    markWeekAsUnattended(weekClassIds, currentWeek)
  }, [weekClassIds, currentWeek, markWeekAsUnattended])

  return {
    markAllAsAttended: handleMarkAllAsAttended,
    markAllAsUnattended: handleMarkAllAsUnattended,
  }
}
