import { describe, expect, it } from 'vitest'
import { DEFAULT_UPDATE_SETTINGS, applyLegacyIntervalMigration, normalizeUpdateSettings } from './settings'
import type { AppUpdateSettings } from './settings'

describe('更新设置的默认值', () => {
  it('「发现新版本时发通知」默认关、总开关默认开（2026-09-23 用户口径）', () => {
    expect(DEFAULT_UPDATE_SETTINGS.notify).toBe(false)
    expect(DEFAULT_UPDATE_SETTINGS.autoCheck).toBe(true)
    // 通道没有默认值：首次读到版本名时才按安装包类型播种一次。
    expect(DEFAULT_UPDATE_SETTINGS.channel).toBeNull()
  })

  it('间隔默认 1 小时（2026-09-28 口径），且新设备还没有定档', () => {
    expect(DEFAULT_UPDATE_SETTINGS.interval).toBe('1h')
    expect(DEFAULT_UPDATE_SETTINGS.intervalPinned).toBe(false)
    expect(DEFAULT_UPDATE_SETTINGS.lastAttemptAt).toBeNull()
  })

  it('首装（存储里什么都没有）就是这套默认值', () => {
    expect(normalizeUpdateSettings(null)).toEqual(DEFAULT_UPDATE_SETTINGS)
    expect(normalizeUpdateSettings(undefined)).toEqual(DEFAULT_UPDATE_SETTINGS)
    expect(normalizeUpdateSettings({})).toEqual(DEFAULT_UPDATE_SETTINGS)
  })
})

describe('外部输入的收窄', () => {
  it('合法值原样保留：用户自己打开的 notify 不会被改回默认', () => {
    const stored: AppUpdateSettings = {
      channel: 'beta',
      autoCheck: false,
      notify: true,
      interval: '7d',
      lastCheckAt: 1_700_000_000_000,
      lastAttemptAt: 1_700_000_000_500,
      skippedVersion: '1.2.0',
      intervalPinned: true,
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
      lastAttemptAt: {},
      skippedVersion: 42,
      intervalPinned: 'yes',
    }

    expect(normalizeUpdateSettings(stored)).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('NaN / Infinity 时间戳按「没有」处理（否则间隔判定会永远为假、检查静默停摆）', () => {
    expect(normalizeUpdateSettings({ lastCheckAt: Number.NaN, lastAttemptAt: Number.POSITIVE_INFINITY }).lastCheckAt).toBeNull()
    expect(normalizeUpdateSettings({ lastCheckAt: Number.NaN, lastAttemptAt: Number.POSITIVE_INFINITY }).lastAttemptAt).toBeNull()
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

describe('存量间隔提升（1 天 → 1 小时）', () => {
  /** 造一个「旧版本存下来的」设置：JSON 里根本没有 `intervalPinned` 字段。 */
  function legacySettings(interval: AppUpdateSettings['interval']): AppUpdateSettings {
    const stored = { channel: 'all', autoCheck: true, notify: false, interval, lastCheckAt: null, skippedVersion: null }
    return normalizeUpdateSettings(stored)
  }

  it('旧默认 1 天且没有定档标记 → 提升为 1 小时并定档', () => {
    const migrated = applyLegacyIntervalMigration(legacySettings('1d'))

    expect(migrated.interval).toBe('1h')
    expect(migrated.intervalPinned).toBe(true)
  })

  it('用户自己选过 1 天（已定档）→ 一个字都不动', () => {
    const stored = { ...DEFAULT_UPDATE_SETTINGS, interval: '1d' as const, intervalPinned: true }
    const migrated = applyLegacyIntervalMigration(normalizeUpdateSettings(stored))

    expect(migrated.interval).toBe('1d')
    expect(migrated.intervalPinned).toBe(true)
  })

  it('launch / 3d / 7d / 1h 无论有没有标记都保持', () => {
    for (const interval of ['launch', '3d', '7d', '1h'] as const) {
      expect(applyLegacyIntervalMigration(legacySettings(interval)).interval).toBe(interval)
      expect(applyLegacyIntervalMigration({ ...DEFAULT_UPDATE_SETTINGS, interval, intervalPinned: true }).interval).toBe(interval)
    }
  })

  it('存储里没有 interval 字段 → 直接就是新默认，不会被再改一次', () => {
    const settings = normalizeUpdateSettings({ channel: 'all' })
    const migrated = applyLegacyIntervalMigration(settings)

    expect(migrated.interval).toBe('1h')
    expect(migrated.intervalPinned).toBe(false)
  })

  it('非法 interval → 回落新默认', () => {
    const migrated = applyLegacyIntervalMigration(normalizeUpdateSettings({ interval: '2h' }))

    expect(migrated.interval).toBe('1h')
  })

  it('幂等：迁移结果再走一次不产生变化', () => {
    const once = applyLegacyIntervalMigration(legacySettings('1d'))
    const twice = applyLegacyIntervalMigration(once)

    expect(twice).toEqual(once)
  })

  it('真实存量现场（2026-09-23 真机 dump）会被提升', () => {
    // 原样照抄 archive/2026-09/09-23-update-check-notify/evidence/device-06-real-api-store.txt
    const stored = {
      channel: 'all',
      autoCheck: true,
      notify: true,
      interval: '1d',
      lastCheckAt: 1790168831899,
      skippedVersion: null,
    }

    const migrated = applyLegacyIntervalMigration(normalizeUpdateSettings(stored))

    expect(migrated.interval).toBe('1h')
    expect(migrated.lastCheckAt).toBe(1790168831899)
    expect(migrated.channel).toBe('all')
    expect(migrated.notify).toBe(true)
  })
})
