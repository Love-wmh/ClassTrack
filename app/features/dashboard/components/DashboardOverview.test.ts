import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardOverview } from './DashboardOverview'

type DashboardOverviewProps = Parameters<typeof DashboardOverview>[0]

const overview: DashboardOverviewProps['overview'] = {
  totalClasses: 12,
  uniqueCourseNames: 9,
  totalSessions: 120,
  pastSessions: 60,
  pastAttendedSessions: 40,
  pastAbsentSessions: 5,
  pastUnmarkedSessions: 15,
  notedSessions: 3,
  totalCompletionRate: 33,
  currentCompletionRate: 67,
  absenceRate: 8,
  markRate: 75,
}

function render(attendanceEnabled: boolean) {
  return renderToStaticMarkup(
    createElement(DashboardOverview, {
      overview,
      formatPercent: (value: number) => `${Math.round(value)}%`,
      attendanceEnabled,
    } satisfies DashboardOverviewProps)
  )
}

describe('看板指标卡与出勤开关', () => {
  const attendanceTitles = ['截止今日完成度', '截止今日缺勤率', '总课程完成度', '标记覆盖率', '未标记课次']

  it('关闭出勤时依赖出勤的指标卡一个都不渲染', () => {
    const html = render(false)

    for (const title of attendanceTitles) {
      expect(html).not.toContain(title)
    }
    expect(html).not.toContain('缺勤课次')
  })

  it('关闭出勤时保留课程实例 / 总课次数量 / 备注数量，并把网格收成 3 列', () => {
    const html = render(false)

    expect(html).toContain('课程实例')
    expect(html).toContain('总课次数量')
    expect(html).toContain('备注数量')
    expect(html).toContain('xl:grid-cols-3')
    expect(html).not.toContain('xl:grid-cols-4')
  })

  it('开启出勤时这些卡片全部回来，网格回到 4 列', () => {
    const html = render(true)

    for (const title of attendanceTitles) {
      expect(html).toContain(title)
    }
    expect(html).toContain('xl:grid-cols-4')
  })
})
