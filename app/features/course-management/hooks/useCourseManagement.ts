import { useMemo } from 'react'
import { useClassStore } from '~/store'
import { toChineseWeekday } from '~/features/dashboard/utils'
import type { Class } from '~/lib/types'

export type CourseInfo = {
  key: string
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

  return useMemo(() => {
    const courses = Array.from(groupClassesByCourse(classes).values())
      .map(toCourseInfo)
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))

    return {
      courses,
      totalCourses: courses.length,
      totalCourseInstances: classes.length,
      hasCourses: courses.length > 0,
    }
  }, [classes])
}

function groupClassesByCourse(classes: Class[]) {
  return classes.reduce((groups, classItem) => {
    const key = [classItem.courseId || classItem.name, classItem.name, classItem.teacher].join('-')
    const current = groups.get(key) ?? []
    current.push(classItem)
    groups.set(key, current)
    return groups
  }, new Map<string, Class[]>())
}

function toCourseInfo(classes: Class[]): CourseInfo {
  const [firstClass] = classes
  const allWeeks = classes.flatMap((classItem) => classItem.weeks)

  return {
    key: [firstClass.courseId || firstClass.id, firstClass.name, firstClass.teacher].join('-'),
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
  }
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
