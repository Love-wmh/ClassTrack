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

describe('课程格的尺度与视觉锚点', () => {
  it('教室元素带 data-course-room 锚点（验收脚本要靠它断言不溢出 / 不被丢弃）', () => {
    expect(render()).toContain('data-course-room')
  })

  it('字号与行高走 --cc-* 容器变量，不再有与格子尺寸无关的 px 字号', () => {
    const html = render()

    expect(html).toContain('var(--cc-name-raw)')
    expect(html).toContain('var(--cc-name-lh)')
    expect(html).toContain('var(--cc-room-raw)')
    expect(html).toContain('var(--cc-room-lh)')
    // 兜底缩放必须在使用处相乘（写在网格声明里会被固化掉），钳位也必须在使用处
    expect(html).toContain('var(--cc-scale,1)')
    expect(html).toMatch(/font-size:clamp\(8px,/)
    // 改动前这里是 text-[10px] / text-[9px] + md:text-sm / md:text-xs 两套硬编码值
    expect(html).not.toMatch(/text-\[\d+px\]/)
    expect(html).not.toContain('md:text-sm')
    expect(html).not.toContain('md:text-xs')
  })

  it('内边距 / 圆角 / 描边 / 角标同样由容器尺度推导', () => {
    const html = render()

    expect(html).toContain('[padding:var(--cc-pad-y)_var(--cc-pad-x)]')
    expect(html).toContain('[border-radius:var(--cc-radius)]')
    expect(html).toContain('var(--cc-ring)')
    expect(html).toContain('[width:var(--cc-badge)]')
    // 改动前固定 ring-2 / rounded-md md:rounded-lg / size-3 md:size-4
    expect(html).not.toContain('ring-2')
    expect(html).not.toContain('md:rounded-lg')
    expect(html).not.toContain('md:size-4')
  })

  it('单双周徽标的可见性交给 CSS 断点，不再由视口布尔值决定', () => {
    const html = render()

    expect(html).toContain('data-course-parity')
    expect(html).toContain('md:hidden')
    expect(html).toContain('单周')
  })

  it('出勤角标存在时带容器尺度的尺寸类', () => {
    const html = render({ mark: attendedMark, attendanceEnabled: true })
    const badgeMatches = html.match(/\[width:var\(--cc-badge\)\]/g) ?? []

    expect(badgeMatches.length).toBe(1)
    expect(html.match(/\[height:var\(--cc-badge\)\]/g)?.length).toBe(1)
  })
})
