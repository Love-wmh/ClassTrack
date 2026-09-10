import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Class, ClassMark, CourseMetadataMap } from '~/lib/types'
import { toChineseWeekday } from '~/features/dashboard/utils'
import { getCourseKey, getMarkKey } from '~/store/utils'

export type SubstituteLesson = {
  date: Date
  dateKey: string
  weekday: string
  name: string
  teacher: string
  classroom: string
  time: string
  sections: string
  note: string
}

function toClassDayOfWeek(date: Date) {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

function parseDateStart(value: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function getCourseNote(classItem: Class, courseMetadata: CourseMetadataMap) {
  const fields = courseMetadata[getCourseKey(classItem)]?.fields || []
  return fields.find((field) => field.id === 'builtin-note')?.content.trim() || ''
}

function toLesson(
  classItem: Class,
  date: Date,
  classMarks: Record<string, ClassMark>,
  courseMetadata: CourseMetadataMap,
  week: number
): SubstituteLesson {
  const markNote = classMarks[getMarkKey(classItem.id, week)]?.note.trim() || ''
  const courseNote = getCourseNote(classItem, courseMetadata)

  return {
    date,
    dateKey: format(date, 'yyyy-MM-dd'),
    weekday: `周${toChineseWeekday(classItem.dayOfWeek)}`,
    name: classItem.name,
    teacher: classItem.teacher || '未记录教师',
    classroom: classItem.classroom || '未记录教室',
    time: `${classItem.startTime}-${classItem.endTime}`,
    sections: `${classItem.startSection}-${classItem.endSection}节`,
    note: markNote || courseNote,
  }
}

function getWeekForDate(firstWeekStart: Date, date: Date) {
  return Math.floor(differenceInCalendarDays(startOfDay(date), firstWeekStart) / 7) + 1
}

export function getLessonsForDates(
  dates: Date[],
  classes: Class[],
  classMarks: Record<string, ClassMark>,
  courseMetadata: CourseMetadataMap,
  firstWeekStartDate: string | null
): SubstituteLesson[] {
  const firstWeekStart = parseDateStart(firstWeekStartDate)
  const uniqueDates = Array.from(new Map(dates.map((date) => [format(startOfDay(date), 'yyyy-MM-dd'), startOfDay(date)])).values()).sort(
    (left, right) => left.getTime() - right.getTime()
  )

  return uniqueDates.flatMap((date) => {
    const dayOfWeek = toClassDayOfWeek(date)
    const week = firstWeekStart ? getWeekForDate(firstWeekStart, date) : null

    return classes
      .filter((classItem) => classItem.dayOfWeek === dayOfWeek && (week == null || classItem.weeks.includes(week)))
      .sort((left, right) => left.startSection - right.startSection || left.startTime.localeCompare(right.startTime))
      .map((classItem) => toLesson(classItem, date, classMarks, courseMetadata, week ?? classItem.weeks[0] ?? 1))
  })
}

export function getTomorrowDate(from = new Date()) {
  return addDays(startOfDay(from), 1)
}

export function formatLessonMarkdown(lessons: SubstituteLesson[]) {
  if (lessons.length === 0) return ''

  const groups = new Map<string, SubstituteLesson[]>()
  lessons.forEach((lesson) => {
    const current = groups.get(lesson.dateKey) ?? []
    current.push(lesson)
    groups.set(lesson.dateKey, current)
  })

  return Array.from(groups.entries())
    .map(([, dayLessons]) => {
      const heading = format(dayLessons[0].date, 'yyyy年M月d日 EEEE', { locale: zhCN })
      const items = dayLessons
        .map((lesson) => {
          const note = lesson.note ? `\n  - 备注：${lesson.note.replaceAll('\n', ' ')}` : ''
          return `- **${lesson.name}**\n  - 时间：${lesson.time}（${lesson.sections}）\n  - 教师：${lesson.teacher}\n  - 教室：${lesson.classroom}${note}`
        })
        .join('\n')

      return `## ${heading}\n\n${items}`
    })
    .join('\n\n')
}

export function mergeImportedMarkdown(current: string, imported: string) {
  if (!imported) return current
  if (!current.trim()) return imported
  return `${current.trimEnd()}\n\n${imported}`
}

export function formatExportFileName(dates: Date[]) {
  if (dates.length === 0) return '课程信息'
  const uniqueDates = Array.from(new Set(dates.map((date) => format(date, 'M月d日'))))
  return `${uniqueDates.join('、')}的课程信息`
}
