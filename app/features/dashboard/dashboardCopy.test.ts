import { describe, expect, it } from 'vitest'
import { ATTENDANCE_OFF_HINT, getDashboardEmptyDescription, getDashboardSubtitle } from './dashboardCopy'

describe('数据看板文案与出勤开关', () => {
  it('开启出勤时保持改动前的副标题，一个字都不变', () => {
    expect(getDashboardSubtitle(true)).toBe('展示课程完成度、缺勤率、课程分布和风险课程分析。')
  })

  it('关闭出勤时副标题不再承诺完成度与缺勤率', () => {
    const subtitle = getDashboardSubtitle(false)

    expect(subtitle).not.toContain('完成度')
    expect(subtitle).not.toContain('缺勤')
    expect(subtitle).toContain('课程分布')
  })

  it('无课程时的空态说明同样按开关切换', () => {
    expect(getDashboardEmptyDescription(true)).toContain('缺勤率')
    expect(getDashboardEmptyDescription(false)).not.toContain('缺勤率')
    expect(getDashboardEmptyDescription(false)).toContain('课程分布')
  })

  it('提示卡必须说明「数据还在」，并给出开启入口', () => {
    expect(ATTENDANCE_OFF_HINT.title).toBe('出勤统计已关闭')
    expect(ATTENDANCE_OFF_HINT.description).toContain('已记录的出勤数据仍保留在本地与备份中')
    expect(ATTENDANCE_OFF_HINT.action).toBe('去开启')
  })
})
