import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Class, ClassMark } from '~/lib/types'
import ScheduleCourseCell from './ScheduleCourseCell'

type ScheduleCourseCellProps = Parameters<typeof ScheduleCourseCell>[0]

const course: Class = {
  id: 'class-1',
  name: '高等数学',
  teacher: '张老师',
  classroom: 'A101',
  startTime: '08:00',
  endTime: '09:40',
  dayOfWeek: 1,
  startSection: 1,
  endSection: 2,
  weeks: [3],
  semester: '2025-2026-1',
  courseId: 'MATH',
  classId: '班级1',
  courseType: '必修',
  courseCategory: '专业课',
}

const attendedMark: ClassMark = { classId: 'class-1', week: 3, isAttended: true, note: '', attendanceMarked: true }
const notedMark: ClassMark = { classId: 'class-1', week: 3, isAttended: false, note: '带实验报告', attendanceMarked: false }

function render(overrides: Partial<ScheduleCourseCellProps> = {}) {
  return renderToStaticMarkup(
    createElement(ScheduleCourseCell, {
      course,
      mark: attendedMark,
      attendanceEnabled: true,
      showClassroom: true,
      showTeacher: true,
      showNote: true,
      onClick: () => {},
      ...overrides,
    })
  )
}

describe('课程格的出勤外观', () => {
  it('关闭出勤时：外圈、色条、角标与「已上/未上」文案一个都不出现', () => {
    const html = render({ mark: attendedMark, attendanceEnabled: false })

    expect(html).not.toContain('ring-emerald')
    expect(html).not.toContain('ring-rose')
    expect(html).not.toContain('bg-emerald-500')
    expect(html).not.toContain('bg-rose-500')
    expect(html).not.toContain('已上')
    expect(html).not.toContain('未上')
  })

  it('关闭出勤时备注照旧显示（备注与出勤解耦）', () => {
    expect(render({ mark: notedMark, attendanceEnabled: false })).toContain('带实验报告')
  })

  it('开启出勤时恢复已上的外圈、色条与勾选角标', () => {
    const html = render({ attendanceEnabled: true })

    expect(html).toContain('ring-emerald-300/70')
    expect(html).toContain('bg-emerald-500')
    expect(html).toContain('已上')
  })

  it('开启出勤且没有标记时按「未上」呈现', () => {
    const html = render({ mark: undefined, attendanceEnabled: true })

    expect(html).toContain('ring-rose-300/70')
    expect(html).toContain('bg-rose-500')
    expect(html).toContain('未上')
  })
})
