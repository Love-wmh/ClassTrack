import { describe, expect, it } from 'vitest'
import {
  CHECK_INTERVALS,
  CHECK_INTERVAL_LABELS,
  DEFAULT_CHECK_INTERVAL,
  FAILURE_RETRY_COOLDOWN_MS,
  checkIntervalMs,
  normalizeCheckInterval,
  shouldCheckNow,
} from './schedule'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0)

describe('检查间隔', () => {
  it('默认是 1 小时', () => {
    expect(DEFAULT_CHECK_INTERVAL).toBe('1h')
    expect(CHECK_INTERVALS).toEqual(['launch', '1h', '1d', '3d', '7d'])
  })

  it('每个档位都有中文名', () => {
    expect(CHECK_INTERVAL_LABELS).toEqual({
      launch: '每次启动',
      '1h': '1 小时',
      '1d': '1 天',
      '3d': '3 天',
      '7d': '7 天',
    })
  })

  it('按档位换算毫秒，launch 为 0', () => {
    expect(checkIntervalMs('launch')).toBe(0)
    expect(checkIntervalMs('1h')).toBe(HOUR_MS)
    expect(checkIntervalMs('1d')).toBe(DAY_MS)
    expect(checkIntervalMs('3d')).toBe(3 * DAY_MS)
    expect(checkIntervalMs('7d')).toBe(7 * DAY_MS)
  })

  it('不认识的值当未设置处理', () => {
    expect(normalizeCheckInterval('1h')).toBe('1h')
    expect(normalizeCheckInterval('1d')).toBe('1d')
    expect(normalizeCheckInterval('2h')).toBeNull()
    expect(normalizeCheckInterval(null)).toBeNull()
    expect(normalizeCheckInterval(3600)).toBeNull()
  })
})

describe('节流判定', () => {
  it('从未检查过 → 立刻检查', () => {
    expect(shouldCheckNow({ interval: '1h', lastCheckAt: null, lastAttemptAt: null, now: NOW })).toBe(true)
    expect(shouldCheckNow({ interval: 'launch', lastCheckAt: null, lastAttemptAt: null, now: NOW })).toBe(true)
  })

  it('距上次成功不足间隔 → 不放行', () => {
    const lastCheckAt = NOW - 59 * MINUTE_MS
    expect(shouldCheckNow({ interval: '1h', lastCheckAt, lastAttemptAt: lastCheckAt, now: NOW })).toBe(false)
  })

  it('距上次成功超过间隔 → 放行', () => {
    const lastCheckAt = NOW - HOUR_MS
    expect(shouldCheckNow({ interval: '1h', lastCheckAt, lastAttemptAt: lastCheckAt, now: NOW })).toBe(true)

    const dayAgo = NOW - DAY_MS
    expect(shouldCheckNow({ interval: '1d', lastCheckAt: dayAgo, lastAttemptAt: dayAgo, now: NOW })).toBe(true)
    expect(shouldCheckNow({ interval: '3d', lastCheckAt: NOW - 3 * DAY_MS, lastAttemptAt: NOW - 3 * DAY_MS, now: NOW })).toBe(true)
    expect(shouldCheckNow({ interval: '7d', lastCheckAt: NOW - 8 * DAY_MS, lastAttemptAt: NOW - 8 * DAY_MS, now: NOW })).toBe(true)
  })

  it('「每次启动」不按间隔节流：刚成功过也放行', () => {
    expect(shouldCheckNow({ interval: 'launch', lastCheckAt: NOW, lastAttemptAt: NOW, now: NOW })).toBe(true)
  })
})

describe('失败不消耗间隔窗口（2026-09-28 上报的缺陷）', () => {
  it('上一次失败且刚过冷却 → 立即放行，即使距上次成功还很近', () => {
    const lastCheckAt = NOW - 5 * MINUTE_MS
    const lastAttemptAt = NOW - FAILURE_RETRY_COOLDOWN_MS

    expect(shouldCheckNow({ interval: '1d', lastCheckAt, lastAttemptAt, now: NOW })).toBe(true)
  })

  it('上一次失败但还在冷却里 → 不放行（防断网时每次切前台都重试）', () => {
    const lastCheckAt = NOW - 5 * MINUTE_MS
    const lastAttemptAt = NOW - 1000

    expect(shouldCheckNow({ interval: '1d', lastCheckAt, lastAttemptAt, now: NOW })).toBe(false)
  })

  it('从未成功过（冷启动第一次就失败）→ 仍在冷却内时不放行，出冷却即放行', () => {
    expect(shouldCheckNow({ interval: '1h', lastCheckAt: null, lastAttemptAt: NOW - 1000, now: NOW })).toBe(false)
    expect(shouldCheckNow({ interval: '1h', lastCheckAt: null, lastAttemptAt: NOW - FAILURE_RETRY_COOLDOWN_MS, now: NOW })).toBe(true)
  })

  it('「每次启动」档也要受失败冷却约束', () => {
    expect(shouldCheckNow({ interval: 'launch', lastCheckAt: null, lastAttemptAt: NOW - 1000, now: NOW })).toBe(false)
    expect(shouldCheckNow({ interval: 'launch', lastCheckAt: null, lastAttemptAt: NOW - FAILURE_RETRY_COOLDOWN_MS, now: NOW })).toBe(true)
  })

  it('最近一次尝试就是那次成功 → 走间隔判定，不走冷却', () => {
    const lastCheckAt = NOW - 30 * MINUTE_MS
    expect(shouldCheckNow({ interval: '1h', lastCheckAt, lastAttemptAt: lastCheckAt, now: NOW })).toBe(false)
  })

  it('失败出冷却后忽略间隔：7 天档也立刻放行', () => {
    const lastCheckAt = NOW - 5 * MINUTE_MS
    const lastAttemptAt = NOW - FAILURE_RETRY_COOLDOWN_MS
    expect(shouldCheckNow({ interval: '7d', lastCheckAt, lastAttemptAt, now: NOW })).toBe(true)
  })

  it('冷却边界是「到达即放行」', () => {
    const lastCheckAt = NOW - 5 * MINUTE_MS
    expect(shouldCheckNow({ interval: '1d', lastCheckAt, lastAttemptAt: NOW - FAILURE_RETRY_COOLDOWN_MS + 1, now: NOW })).toBe(false)
  })

  it('失败尝试的时间戳在未来（改过系统时间）→ 不被冷却锁死', () => {
    expect(shouldCheckNow({ interval: '1h', lastCheckAt: null, lastAttemptAt: NOW + DAY_MS, now: NOW })).toBe(true)
  })
})

describe('时钟与重入', () => {
  it('时间戳在未来（改过系统时间）→ 放行，不永久静默', () => {
    const future = NOW + DAY_MS
    expect(shouldCheckNow({ interval: '7d', lastCheckAt: future, lastAttemptAt: future, now: NOW })).toBe(true)
  })

  it('检查进行中 → 不放行（重入保护，且优先于「从未检查过」）', () => {
    expect(shouldCheckNow({ interval: 'launch', lastCheckAt: null, lastAttemptAt: null, now: NOW, inFlight: true })).toBe(false)
    expect(shouldCheckNow({ interval: '1h', lastCheckAt: NOW - DAY_MS, lastAttemptAt: NOW - DAY_MS, now: NOW, inFlight: true })).toBe(false)
  })

  it('手动检查忽略间隔、失败冷却与重入', () => {
    expect(shouldCheckNow({ interval: '7d', lastCheckAt: NOW, lastAttemptAt: NOW, now: NOW, manual: true })).toBe(true)
    expect(shouldCheckNow({ interval: '7d', lastCheckAt: null, lastAttemptAt: NOW, now: NOW, manual: true })).toBe(true)
    expect(shouldCheckNow({ interval: '7d', lastCheckAt: NOW, lastAttemptAt: NOW, now: NOW, manual: true, inFlight: true })).toBe(true)
  })
})
