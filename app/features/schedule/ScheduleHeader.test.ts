import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ScheduleHeader from './ScheduleHeader'

type ScheduleHeaderProps = Parameters<typeof ScheduleHeader>[0]

function render(attendanceEnabled: boolean) {
  return renderToStaticMarkup(
    createElement(ScheduleHeader, {
      currentWeek: 3,
      maxWeek: 16,
      currentRealWeek: 5,
      attendanceEnabled,
      onWeekChange: () => {},
      onMarkAllAsAttended: () => {},
      onMarkAllAsUnattended: () => {},
    } satisfies ScheduleHeaderProps)
  )
}

describe('课表顶栏的出勤批量标记入口', () => {
  it('关闭出勤时两个批量按钮都不渲染，左侧动作组收窄成 3 列', () => {
    const html = render(false)

    expect(html).not.toContain('全部已上')
    expect(html).not.toContain('全部未上')
    expect(html).toContain('grid-cols-[2.25rem_2.25rem_2.25rem]')
    expect(html).not.toContain('grid-cols-[2.25rem_2.25rem_1fr_1fr_2.25rem]')
  })

  it('开启出勤时两个批量按钮都在，列数回到 5 列', () => {
    const html = render(true)

    expect(html).toContain('全部已上')
    expect(html).toContain('全部未上')
    expect(html).toContain('grid-cols-[2.25rem_2.25rem_1fr_1fr_2.25rem]')
  })

  it('翻周与返回本周在任何状态下都保留', () => {
    const html = render(false)

    expect(html).toContain('上一周')
    expect(html).toContain('下一周')
    expect(html).toContain('返回本周')
    expect(html).toContain('第 3 周')
  })
})
