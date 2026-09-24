import { describe, expect, it } from 'vitest'
import type { Class, ClassMark } from '~/lib/types'
import {
  expandCourseSessions,
  formatPercent,
  getDashboardRange,
  isAbsentSession,
  isAttendedSession,
  isUnmarkedSession,
  safeRate,
  toChineseWeekday,
} from './utils'
import type { DashboardRange } from './utils'

const course: Class = {
  id: 'class-1',
  name: '课程',
  teacher: '老师',
  classroom: '教室',
  startTime: '08:00',
  endTime: '09:40',
  dayOfWeek: 1,
  startSection: 1,
  endSection: 2,
  weeks: [1, 3],
  semester: '2025-2026-1',
  courseId: 'COURSE',
  classId: 'CLASS',
  courseType: '必修',
  courseCategory: '专业课',
}

/** 只看备注、没做出勤判断的标记：`isAbsentSession` 必须把它排除在缺勤之外。 */
const unmarkedMark: ClassMark = { classId: 'class-1', week: 3, isAttended: false, note: '', attendanceMarked: false }

/** 基准统计范围：第 3 周以前（含第 3 周）视为已发生。 */
const range: DashboardRange = { currentWeek: 3, currentDayOfWeek: 7, hasDateBase: false, label: '测试' }

describe('看板统计工具', () => {
  it('安全计算和格式化百分比', () => {
    expect(safeRate(0, 0)).toBe(0)
    expect(formatPercent(NaN)).toBe('0%')
    expect(formatPercent(62.5)).toBe('63%')
  })

  it('转换中文星期并对越界值回退', () => {
    expect(toChineseWeekday(1)).toBe('一')
    expect(toChineseWeekday(7)).toBe('日')
    expect(toChineseWeekday(8)).toBe('8')
  })

  it('没有日期依据时使用回退周次', () => {
    expect(getDashboardRange(null, 3, 10)).toEqual({
      currentWeek: 3,
      currentDayOfWeek: 7,
      hasDateBase: false,
      label: '按当前第 3 周估算',
    })
  })

  it('按课程周次展开并关联出勤标记', () => {
    const sessions = expandCourseSessions(
      [course],
      { 'class-1-3': { classId: 'class-1', week: 3, isAttended: true, note: '', attendanceMarked: true } },
      {
        currentWeek: 3,
        currentDayOfWeek: 7,
        hasDateBase: false,
        label: '测试',
      }
    )

    expect(sessions).toHaveLength(2)
    expect(sessions[1].mark?.isAttended).toBe(true)
    expect(sessions[0].isPast).toBe(true)
  })

  it('只写了备注的课次算未标记，不算缺勤', () => {
    const sessions = expandCourseSessions([course], { 'class-1-3': { ...unmarkedMark, note: '带实验报告' } }, range)

    expect(sessions.filter(isUnmarkedSession)).toHaveLength(2)
    expect(sessions.filter(isAbsentSession)).toHaveLength(0)
    expect(sessions.filter(isAttendedSession)).toHaveLength(0)
  })

  it('做出勤判断的课次按已上 / 缺勤计数', () => {
    const sessions = expandCourseSessions(
      [course],
      {
        'class-1-3': { classId: 'class-1', week: 3, isAttended: false, note: '请假', attendanceMarked: true },
      },
      range
    )

    expect(sessions.filter(isAbsentSession)).toHaveLength(1)
    expect(sessions.filter(isUnmarkedSession)).toHaveLength(1)
  })
})
