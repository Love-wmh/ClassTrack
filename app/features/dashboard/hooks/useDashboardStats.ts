import { useMemo } from 'react'
import { useClassStore } from '~/store'
import {
  expandCourseSessions,
  formatPercent,
  getDashboardRange,
  isAbsentSession,
  isAttendedSession,
  isUnmarkedSession,
  safeRate,
  toChineseWeekday,
} from '../utils'

type GroupStats = {
  name: string
  total: number
  pastTotal: number
  attended: number
  absent: number
  unmarked: number
  completionRate: number
  absenceRate: number
}

export function useDashboardStats() {
  const { school, classes, classMarks, currentWeek, firstWeekStartDate } = useClassStore()

  return useMemo(() => {
    const maxWeek = classes.reduce((max, classItem) => Math.max(max, ...classItem.weeks), 1)
    const range = getDashboardRange(firstWeekStartDate, currentWeek, maxWeek)
    const sessions = expandCourseSessions(classes, classMarks, range)
    const pastSessions = sessions.filter((session) => session.isPast)
    const attendedSessions = sessions.filter(isAttendedSession)
    const pastAttendedSessions = pastSessions.filter(isAttendedSession)
    const pastAbsentSessions = pastSessions.filter(isAbsentSession)
    const pastUnmarkedSessions = pastSessions.filter(isUnmarkedSession)
    const futureSessions = sessions.filter((session) => !session.isPast)
    const notedSessions = sessions.filter((session) => session.mark?.note)
    const uniqueCourseNames = new Set(classes.map((classItem) => classItem.name)).size
    const teacherCount = new Set(classes.map((classItem) => classItem.teacher).filter(Boolean)).size
    const classroomCount = new Set(classes.map((classItem) => classItem.classroom).filter(Boolean)).size

    const overview = {
      totalClasses: classes.length,
      uniqueCourseNames,
      teacherCount,
      classroomCount,
      totalSessions: sessions.length,
      pastSessions: pastSessions.length,
      futureSessions: futureSessions.length,
      attendedSessions: attendedSessions.length,
      pastAttendedSessions: pastAttendedSessions.length,
      pastAbsentSessions: pastAbsentSessions.length,
      pastUnmarkedSessions: pastUnmarkedSessions.length,
      notedSessions: notedSessions.length,
      totalCompletionRate: safeRate(attendedSessions.length, sessions.length),
      currentCompletionRate: safeRate(pastAttendedSessions.length, pastSessions.length),
      absenceRate: safeRate(pastAbsentSessions.length, pastSessions.length),
      markRate: safeRate(pastSessions.length - pastUnmarkedSessions.length, pastSessions.length),
    }

    const weeklyTrend = Array.from({ length: maxWeek }, (_, index) => {
      const week = index + 1
      const weekSessions = sessions.filter((session) => session.week === week)
      const attended = weekSessions.filter(isAttendedSession).length
      const absent = weekSessions.filter(isAbsentSession).length
      const unmarked = weekSessions.filter((session) => session.isPast && isUnmarkedSession(session)).length
      return {
        week: `第${week}周`,
        应上: weekSessions.length,
        已上: attended,
        缺勤: absent,
        未标记: unmarked,
      }
    })

    const weekdayDistribution = Array.from({ length: 7 }, (_, index) => {
      const dayOfWeek = index + 1
      const daySessions = sessions.filter((session) => session.classItem.dayOfWeek === dayOfWeek)
      return {
        name: `周${toChineseWeekday(dayOfWeek)}`,
        总课次: daySessions.length,
        已上: daySessions.filter(isAttendedSession).length,
        缺勤: daySessions.filter(isAbsentSession).length,
      }
    })

    const courseRanking = groupByName(
      classes.map((classItem) => classItem.name),
      sessions,
      (session) => session.classItem.name
    )
      .sort((left, right) => right.absent - left.absent || right.pastTotal - left.pastTotal)
      .slice(0, 8)

    const categoryBreakdown = groupByName(
      classes.map((classItem) => classItem.courseCategory || '未分类'),
      sessions,
      (session) => session.classItem.courseCategory || '未分类'
    )
      .sort((left, right) => right.total - left.total)
      .slice(0, 8)

    const typeBreakdown = groupByName(
      classes.map((classItem) => classItem.courseType || '未分类'),
      sessions,
      (session) => session.classItem.courseType || '未分类'
    )
      .sort((left, right) => right.total - left.total)
      .slice(0, 8)

    const sectionDistribution = groupByName(
      classes.map((classItem) => `${classItem.startSection}-${classItem.endSection}节`),
      sessions,
      (session) => `${session.classItem.startSection}-${session.classItem.endSection}节`
    ).sort((left, right) => Number(left.name.split('-')[0]) - Number(right.name.split('-')[0]))

    const riskCourses = courseRanking.filter((item) => item.absent > 0 || item.unmarked > 0).slice(0, 5)

    return {
      school,
      classes,
      range,
      overview,
      weeklyTrend,
      weekdayDistribution,
      courseRanking,
      categoryBreakdown,
      typeBreakdown,
      sectionDistribution,
      riskCourses,
      hasClasses: classes.length > 0,
      formatPercent,
    }
  }, [school, classes, classMarks, currentWeek, firstWeekStartDate])
}

function groupByName(
  names: string[],
  sessions: ReturnType<typeof expandCourseSessions>,
  selector: (session: ReturnType<typeof expandCourseSessions>[number]) => string
): GroupStats[] {
  return Array.from(new Set(names)).map((name) => {
    const items = sessions.filter((session) => selector(session) === name)
    const pastItems = items.filter((session) => session.isPast)
    const attended = items.filter(isAttendedSession).length
    const absent = pastItems.filter(isAbsentSession).length
    const unmarked = pastItems.filter(isUnmarkedSession).length
    return {
      name,
      total: items.length,
      pastTotal: pastItems.length,
      attended,
      absent,
      unmarked,
      completionRate: safeRate(attended, items.length),
      absenceRate: safeRate(absent, pastItems.length),
    }
  })
}
