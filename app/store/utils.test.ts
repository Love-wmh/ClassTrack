import { describe, expect, it } from 'vitest'
import type { Class, ClassMark } from '~/lib/types'
import { createPastClassMarks, getMarkKey, isAttendanceMarked } from './utils'

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

/** 造一条「已做出勤判断」的标记；用 overrides 表达「只写了备注」等场景。 */
const createMark = (overrides: Partial<ClassMark> = {}): ClassMark => ({
  classId: 'class-1',
  week: 1,
  isAttended: false,
  note: '',
  attendanceMarked: true,
  ...overrides,
})

/** 模拟 schema ≤ 3 的旧标记：当年没有这个字段。 */
function withoutAttendanceMarked(mark: ClassMark): ClassMark {
  const legacy: Partial<ClassMark> = { ...mark }
  delete legacy.attendanceMarked
  return legacy as ClassMark
}

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

  it('自动补标的课次记为「已做出勤判断」', () => {
    const marks = createPastClassMarks([createClass(1, 1, '09:40')], '2025-01-06', 1, new Date(2025, 0, 6, 10, 0))

    expect(marks['class-1-1-1'].attendanceMarked).toBe(true)
  })

  it('出勤判断判据：没有标记 / 只写备注 / 已判断', () => {
    expect(isAttendanceMarked(undefined)).toBe(false)
    expect(isAttendanceMarked(createMark({ attendanceMarked: false }))).toBe(false)
    expect(isAttendanceMarked(createMark())).toBe(true)
    // 运行时兜底：字段缺失（旧备份）按「已判断」处理
    expect(isAttendanceMarked(withoutAttendanceMarked(createMark()))).toBe(true)
  })
})
