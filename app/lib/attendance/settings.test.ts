import { describe, expect, it } from 'vitest'
import { DEFAULT_ATTENDANCE_SETTINGS, normalizeAttendanceSettings } from './settings'

describe('出勤统计设置', () => {
  it('默认关闭：首装与升级后的老设备一律不显示出勤能力', () => {
    expect(DEFAULT_ATTENDANCE_SETTINGS).toEqual({ enabled: false })
  })

  it('没有存储内容时回落默认值', () => {
    expect(normalizeAttendanceSettings(undefined).enabled).toBe(false)
    expect(normalizeAttendanceSettings(null).enabled).toBe(false)
    expect(normalizeAttendanceSettings({}).enabled).toBe(false)
    expect(normalizeAttendanceSettings('错误数据').enabled).toBe(false)
  })

  it('非布尔值一律回落，而不是做真假值转换', () => {
    expect(normalizeAttendanceSettings({ enabled: 'true' }).enabled).toBe(false)
    expect(normalizeAttendanceSettings({ enabled: 'false' }).enabled).toBe(false)
    expect(normalizeAttendanceSettings({ enabled: 1 }).enabled).toBe(false)
    expect(normalizeAttendanceSettings({ enabled: 0 }).enabled).toBe(false)
  })

  it('布尔值原样保留', () => {
    expect(normalizeAttendanceSettings({ enabled: true }).enabled).toBe(true)
    expect(normalizeAttendanceSettings({ enabled: false }).enabled).toBe(false)
  })

  it('坏值回落到传入的 fallback', () => {
    expect(normalizeAttendanceSettings({ enabled: 'yes' }, { enabled: true }).enabled).toBe(true)
  })
})
