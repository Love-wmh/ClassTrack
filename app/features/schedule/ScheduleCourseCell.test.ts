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
const absentMark: ClassMark = { classId: 'class-1', week: 3, isAttended: false, note: '请假', attendanceMarked: true }
const notedMark: ClassMark = { classId: 'class-1', week: 3, isAttended: false, note: '带实验报告', attendanceMarked: false }

function render(overrides: Partial<ScheduleCourseCellProps> = {}) {
  return renderToStaticMarkup(
    createElement(ScheduleCourseCell, {
      course,
      mark: attendedMark,
      attendanceEnabled: true,
      isOutOfWeek: false,
      showTeacher: true,
      showNote: true,
      onClick: () => {},
      ...overrides,
    })
  )
}

/** 出勤淡化（未上）在合并后的视觉里是这样两段类名。 */
const DIM_CLASSES = ['opacity-60', 'saturate-50']

describe('课程格的出勤外观', () => {
  it('关闭出勤统计时：打勾角标、未上淡化与「已上/未上」文案一个都不出现', () => {
    const html = render({ mark: absentMark, attendanceEnabled: false })

    for (const cls of DIM_CLASSES) {
      expect(html).not.toContain(cls)
    }
    expect(html).not.toContain('已上')
    expect(html).not.toContain('未上')
  })

  it('关闭出勤统计时备注照旧显示（备注与出勤解耦）', () => {
    expect(render({ mark: notedMark, attendanceEnabled: false })).toContain('带实验报告')
  })

  it('开启出勤统计时：已上写「已上」且不打淡化', () => {
    const html = render({ mark: attendedMark, attendanceEnabled: true })

    expect(html).toContain('已上')
    for (const cls of DIM_CLASSES) {
      expect(html).not.toContain(cls)
    }
  })

  it('开启出勤统计时：未上（含只写了备注）写「未上」并淡化', () => {
    for (const mark of [absentMark, notedMark, undefined]) {
      const html = render({ mark, attendanceEnabled: true })

      expect(html).toContain('未上')
      for (const cls of DIM_CLASSES) {
        expect(html).toContain(cls)
      }
    }
  })

  it('非本周课走灰色淡化，不叠加出勤痕迹（即使它其实未上）', () => {
    const html = render({ mark: absentMark, attendanceEnabled: true, isOutOfWeek: true })

    expect(html).toContain('data-course-out-of-week')
    expect(html).toContain('非本周')
    expect(html).not.toContain('未上')
    for (const cls of DIM_CLASSES) {
      expect(html).not.toContain(cls)
    }
  })
})
