import type { Class, ClassMark } from '~/lib/types'

export type CourseSession = {
  id: string
  classItem: Class
  week: number
  mark?: ClassMark
  isPast: boolean
}

export type DashboardRange = {
  currentWeek: number
  currentDayOfWeek: number
  hasDateBase: boolean
  label: string
}

export function getDashboardRange(firstWeekStartDate: string | null, fallbackWeek: number, maxWeek: number): DashboardRange {
  if (!firstWeekStartDate) {
    return {
      currentWeek: fallbackWeek,
      currentDayOfWeek: 7,
      hasDateBase: false,
      label: `按当前第 ${fallbackWeek} 周估算`,
    }
  }

  const baseDate = new Date(firstWeekStartDate)
  if (Number.isNaN(baseDate.getTime())) {
    return {
      currentWeek: fallbackWeek,
      currentDayOfWeek: 7,
      hasDateBase: false,
      label: `按当前第 ${fallbackWeek} 周估算`,
    }
  }

  const today = new Date()
  const diffDays = Math.floor((startOfDay(today).getTime() - startOfDay(baseDate).getTime()) / (1000 * 60 * 60 * 24))
  const currentWeek = Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), maxWeek)
  const currentDayOfWeek = Math.min(Math.max((diffDays % 7) + 1, 1), 7)

  return {
    currentWeek,
    currentDayOfWeek,
    hasDateBase: true,
    label: `统计至第 ${currentWeek} 周 周${toChineseWeekday(currentDayOfWeek)}`,
  }
}

export function expandCourseSessions(classes: Class[], classMarks: Record<string, ClassMark>, range: DashboardRange): CourseSession[] {
  return classes.flatMap((classItem) =>
    classItem.weeks.map((week) => {
      const mark = classMarks[getMarkKey(classItem.id, week)]
      return {
        id: `${classItem.id}-${week}`,
        classItem,
        week,
        mark,
        isPast: isPastSession(week, classItem.dayOfWeek, range),
      }
    })
  )
}

export function getMarkKey(classId: string, week: number) {
  return `${classId}-${week}`
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value)}%`
}

export function safeRate(value: number, total: number) {
  if (total === 0) return 0
  return (value / total) * 100
}

export function toChineseWeekday(dayOfWeek: number) {
  return ['一', '二', '三', '四', '五', '六', '日'][dayOfWeek - 1] || String(dayOfWeek)
}

function isPastSession(week: number, dayOfWeek: number, range: DashboardRange) {
  if (week < range.currentWeek) return true
  if (week > range.currentWeek) return false
  return dayOfWeek <= range.currentDayOfWeek
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}
