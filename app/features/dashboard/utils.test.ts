import { describe, expect, it } from 'vitest'
import type { Class } from '~/lib/types'
import { expandCourseSessions, formatPercent, getDashboardRange, safeRate, toChineseWeekday } from './utils'

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
      { 'class-1-3': { classId: 'class-1', week: 3, isAttended: true, note: '' } },
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
})
