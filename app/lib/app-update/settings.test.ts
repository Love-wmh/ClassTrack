import { describe, expect, it } from 'vitest'
import { DEFAULT_UPDATE_SETTINGS, normalizeUpdateSettings } from './settings'

describe('更新设置的默认值', () => {
  it('「发现新版本时发通知」默认关、总开关默认开（2026-09-23 用户口径）', () => {
    expect(DEFAULT_UPDATE_SETTINGS.notify).toBe(false)
    expect(DEFAULT_UPDATE_SETTINGS.autoCheck).toBe(true)
    // 通道没有默认值：首次读到版本名时才按安装包类型播种一次。
    expect(DEFAULT_UPDATE_SETTINGS.channel).toBeNull()
  })

  it('首装（存储里什么都没有）就是这套默认值', () => {
    expect(normalizeUpdateSettings(null)).toEqual(DEFAULT_UPDATE_SETTINGS)
    expect(normalizeUpdateSettings(undefined)).toEqual(DEFAULT_UPDATE_SETTINGS)
    expect(normalizeUpdateSettings({})).toEqual(DEFAULT_UPDATE_SETTINGS)
  })
})

describe('外部输入的收窄', () => {
  it('合法值原样保留：用户自己打开的 notify 不会被改回默认', () => {
    const stored = {
      channel: 'beta',
      autoCheck: false,
      notify: true,
      interval: '7d',
      lastCheckAt: 1_700_000_000_000,
      skippedVersion: '1.2.0',
    }

    expect(normalizeUpdateSettings(stored)).toEqual(stored)
  })

  it('坏值逐字段回落到默认，不影响其它字段', () => {
    const stored = {
      channel: 'nope',
      autoCheck: 'yes',
      notify: 'no',
      interval: '每天',
      lastCheckAt: 'now',
      skippedVersion: 42,
    }

    expect(normalizeUpdateSettings(stored)).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('只缺 notify 时：其余保留，notify 回落到「关」', () => {
    const settings = normalizeUpdateSettings({ channel: 'stable', autoCheck: true, interval: '3d' })

    expect(settings.notify).toBe(false)
    expect(settings.channel).toBe('stable')
    expect(settings.interval).toBe('3d')
  })

  it('显式传 fallback 时按 fallback 回落（persist 的 merge 用的就是当前 state）', () => {
    const fallback = { ...DEFAULT_UPDATE_SETTINGS, autoCheck: false, notify: true }

    expect(normalizeUpdateSettings({}, fallback)).toEqual(fallback)
  })
})
