import { describe, expect, it } from 'vitest'
import type { Class } from '~/lib/types'
import { createPastClassMarks, getMarkKey } from './utils'

const createClass = (week: number, dayOfWeek: number, endTime: string): Class => ({
  id: `class-${week}-${dayOfWeek}`,
  name: '课程',
  teacher: '老师',
  classroom: '教室',
  startTime: '08:00',
  endTime,
  dayOfWeek,
  startSection: 1,
  endSection: 2,
  weeks: [week],
  semester: '2025-2026-1',
  courseId: 'COURSE',
  classId: 'CLASS',
  courseType: '必修',
  courseCategory: '专业课',
})

describe('课程标记工具', () => {
  it('生成稳定的课程周次标记键', () => {
    expect(getMarkKey('class-1', 3)).toBe('class-1-3')
  })

  it('有起始日期时按真实下课时间补标', () => {
    const classes = [createClass(1, 1, '09:40'), createClass(1, 1, '12:00')]
    const marks = createPastClassMarks(classes, '2025-01-06', 1, new Date(2025, 0, 6, 10, 0))

    expect(Object.keys(marks)).toEqual(['class-1-1-1'])
  })

  it('无起始日期时按当前周和星期时间回退判断', () => {
    const classes = [createClass(1, 1, '09:40'), createClass(2, 1, '09:40'), createClass(1, 2, '09:40')]
    const marks = createPastClassMarks(classes, null, 2, new Date(2025, 0, 6, 10, 0))

    expect(Object.keys(marks)).toEqual(['class-1-1-1', 'class-2-1-2', 'class-1-2-1'])
  })
})
