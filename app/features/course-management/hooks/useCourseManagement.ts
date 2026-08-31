import { useMemo } from 'react'
import { useClassStore } from '~/store'
import { getCourseKey } from '~/store/utils'
import { toChineseWeekday } from '~/features/dashboard/utils'
import type { Class, CourseField, CourseMetadataMap } from '~/lib/types'

export type CourseInfo = {
  key: string
  semesterId: string | null
  name: string
  teacher: string
  classrooms: string[]
  semester: string
  courseId: string
  classIds: string[]
  courseTypes: string[]
  courseCategories: string[]
  schedules: CourseSchedule[]
  totalSessions: number
  weekRange: string
  fields: CourseField[]
}

export type CourseSchedule = {
  id: string
  weekday: string
  time: string
  sections: string
  weeks: string
  classroom: string
}

export function useCourseManagement() {
  const classes = useClassStore((state) => state.classes)
  const courseMetadata = useClassStore((state) => state.courseMetadata)
  const currentSemesterId = useClassStore((state) => state.currentSemesterId)

  return useMemo(() => {
    const courses = Array.from(groupClassesByCourse(classes).values())
      .map((courseClasses) => toCourseInfo(courseClasses, courseMetadata, currentSemesterId))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))

    return {
      courses,
      totalCourses: courses.length,
      totalCourseInstances: classes.length,
      hasCourses: courses.length > 0,
    }
  }, [classes, courseMetadata, currentSemesterId])
}

function groupClassesByCourse(classes: Class[]) {
  return classes.reduce((groups, classItem) => {
    const key = getCourseKey(classItem)
    const current = groups.get(key) ?? []
    current.push(classItem)
    groups.set(key, current)
    return groups
  }, new Map<string, Class[]>())
}

function toCourseInfo(classes: Class[], courseMetadata: CourseMetadataMap, semesterId: string | null): CourseInfo {
  const [firstClass] = classes
  const allWeeks = classes.flatMap((classItem) => classItem.weeks)
  const key = getCourseKey(firstClass)

  return {
    key,
    semesterId,
    name: firstClass.name,
    teacher: firstClass.teacher || '未记录教师',
    classrooms: unique(classes.map((classItem) => classItem.classroom).filter(Boolean)),
    semester: firstClass.semester || '未记录学期',
    courseId: firstClass.courseId || '未记录课程号',
    classIds: unique(classes.map((classItem) => classItem.classId).filter(Boolean)),
    courseTypes: unique(classes.map((classItem) => classItem.courseType || '未分类')),
    courseCategories: unique(classes.map((classItem) => classItem.courseCategory || '未分类')),
    schedules: classes.map(toCourseSchedule),
    totalSessions: allWeeks.length,
    weekRange: formatWeekRange(allWeeks),
    fields: getCourseFields(key, firstClass, courseMetadata),
  }
}

function getCourseFields(courseKey: string, firstClass: Class, courseMetadata: CourseMetadataMap) {
  const existingFields = courseMetadata[courseKey]?.fields || []
  const defaultFields: CourseField[] = [
    {
      id: 'builtin-teacher',
      label: '上课教师',
      content: firstClass.teacher || '未记录教师',
      contentType: 'text',
      canDelete: false,
    },
    {
      id: 'builtin-course-id',
      label: '课程号',
      content: firstClass.courseId || '未记录课程号',
      contentType: 'text',
      canDelete: false,
    },
    {
      id: 'builtin-note',
      label: '备注',
      content: '',
      contentType: 'markdown',
      canDelete: false,
    },
  ]

  const fieldsById = new Map(existingFields.map((field) => [field.id, field]))
  const fixedFields = defaultFields.map((field) => ({
    ...field,
    ...(fieldsById.get(field.id) || {}),
    canDelete: false,
    contentType: field.contentType,
  }))
  const customFields = existingFields.filter((field) => !defaultFields.some((defaultField) => defaultField.id === field.id))

  return [...fixedFields, ...customFields]
}

function toCourseSchedule(classItem: Class): CourseSchedule {
  return {
    id: classItem.id,
    weekday: `周${toChineseWeekday(classItem.dayOfWeek)}`,
    time: `${classItem.startTime}-${classItem.endTime}`,
    sections: `${classItem.startSection}-${classItem.endSection}节`,
    weeks: formatWeeks(classItem.weeks),
    classroom: classItem.classroom || '未记录教室',
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function formatWeekRange(weeks: number[]) {
  if (weeks.length === 0) return '未记录周次'
  const sortedWeeks = [...new Set(weeks)].sort((left, right) => left - right)
  return `${sortedWeeks[0]}-${sortedWeeks[sortedWeeks.length - 1]}周`
}

function formatWeeks(weeks: number[]) {
  if (weeks.length === 0) return '未记录周次'

  const sortedWeeks = [...new Set(weeks)].sort((left, right) => left - right)
  const ranges: string[] = []
  let rangeStart = sortedWeeks[0]
  let previousWeek = sortedWeeks[0]

  for (const week of sortedWeeks.slice(1)) {
    if (week === previousWeek + 1) {
      previousWeek = week
      continue
    }

    ranges.push(formatWeekSegment(rangeStart, previousWeek))
    rangeStart = week
    previousWeek = week
  }

  ranges.push(formatWeekSegment(rangeStart, previousWeek))
  return `${ranges.join('、')}周`
}

function formatWeekSegment(startWeek: number, endWeek: number) {
  return startWeek === endWeek ? `${startWeek}` : `${startWeek}-${endWeek}`
}
