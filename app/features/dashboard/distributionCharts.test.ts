import { describe, expect, it } from 'vitest'
import { getSectionDistributionConfig, getWeekdayDistributionConfig } from './distributionCharts'

describe('分布图的出勤系列', () => {
  it('开启出勤时两张图都有总课次 / 已上 / 缺勤三个系列，说明与改动前一致', () => {
    const weekday = getWeekdayDistributionConfig(true)
    const section = getSectionDistributionConfig(true)

    expect(weekday.series.map((item) => item.key)).toEqual(['总课次', '已上', '缺勤'])
    expect(section.series.map((item) => item.key)).toEqual(['total', 'attended', 'absent'])
    expect(weekday.description).toBe('观察一周内课程负担和缺勤分布。')
    expect(section.description).toBe('按上课节次统计课程密度和完成情况。')
  })

  it('关闭出勤时只保留「总课次」，说明也不再提缺勤或完成情况', () => {
    const weekday = getWeekdayDistributionConfig(false)
    const section = getSectionDistributionConfig(false)

    expect(weekday.series.map((item) => item.key)).toEqual(['总课次'])
    expect(section.series.map((item) => item.key)).toEqual(['total'])
    expect(weekday.description).not.toContain('缺勤')
    expect(section.description).not.toContain('完成情况')
  })
})
