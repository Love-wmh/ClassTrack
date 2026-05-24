import { addDays } from 'date-fns'
import type { Class } from '~/lib/types'
import { courseColors } from './constants'

export function getCourseColor(courseId: string) {
  let hash = 0
  for (let index = 0; index < courseId.length; index++) {
    hash = courseId.charCodeAt(index) + ((hash << 5) - hash)
  }
  return courseColors[Math.abs(hash) % courseColors.length]
}

export function getDayDate(firstWeekStartDate: string | null, currentWeek: number, dayOfWeek: number) {
  if (!firstWeekStartDate) return null

  try {
    const baseDate = new Date(firstWeekStartDate)
    const daysOffset = (currentWeek - 1) * 7 + (dayOfWeek - 1)
    return addDays(baseDate, daysOffset)
  } catch {
    return null
  }
}

export function getMaxWeek(classes: Class[]) {
  return classes.reduce((max, classItem) => {
    const classMaxWeek = Math.max(...classItem.weeks)
    return Math.max(max, classMaxWeek)
  }, 20)
}
