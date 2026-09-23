import { describe, expect, it } from 'vitest'
import { CHECK_INTERVALS, DEFAULT_CHECK_INTERVAL, checkIntervalMs, normalizeCheckInterval, shouldCheckNow } from './schedule'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 23, 12, 0, 0)

describe('检查间隔', () => {
  it('默认是 1 天', () => {
    expect(DEFAULT_CHECK_INTERVAL).toBe('1d')
    expect(CHECK_INTERVALS).toEqual(['launch', '1d', '3d', '7d'])
  })

  it('按天换算毫秒，launch 为 0', () => {
    expect(checkIntervalMs('launch')).toBe(0)
    expect(checkIntervalMs('1d')).toBe(DAY_MS)
    expect(checkIntervalMs('3d')).toBe(3 * DAY_MS)
    expect(checkIntervalMs('7d')).toBe(7 * DAY_MS)
  })

  it('不认识的值当未设置处理', () => {
    expect(normalizeCheckInterval('1d')).toBe('1d')
    expect(normalizeCheckInterval('2h')).toBeNull()
    expect(normalizeCheckInterval(null)).toBeNull()
  })
})

describe('节流判定', () => {
  it('从未检查过 → 立刻检查', () => {
    expect(shouldCheckNow({ interval: '1d', lastCheckAt: null, now: NOW })).toBe(true)
    expect(shouldCheckNow({ interval: 'launch', lastCheckAt: null, now: NOW })).toBe(true)
  })

  it('间隔内重复触发只放行一次', () => {
    const lastCheckAt = NOW - 1000
    expect(shouldCheckNow({ interval: '1d', lastCheckAt, now: NOW })).toBe(false)
    expect(shouldCheckNow({ interval: '3d', lastCheckAt, now: NOW })).toBe(false)
  })

  it('超过间隔后放行', () => {
    expect(shouldCheckNow({ interval: '1d', lastCheckAt: NOW - DAY_MS, now: NOW })).toBe(true)
    expect(shouldCheckNow({ interval: '3d', lastCheckAt: NOW - 3 * DAY_MS, now: NOW })).toBe(true)
    expect(shouldCheckNow({ interval: '7d', lastCheckAt: NOW - 8 * DAY_MS, now: NOW })).toBe(true)
  })

  it('「每次启动」不节流：刚查过也放行', () => {
    expect(shouldCheckNow({ interval: 'launch', lastCheckAt: NOW, now: NOW })).toBe(true)
  })

  it('失败的那次也参与节流（否则断网时会每次切前台都重试）', () => {
    // 上一次「尝试」刚发生，无论成功失败都只记时间戳，行为一致。
    expect(shouldCheckNow({ interval: '1d', lastCheckAt: NOW - 60 * 1000, now: NOW })).toBe(false)
  })
})
