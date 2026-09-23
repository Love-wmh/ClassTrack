/**
 * 更新检查的调度口径：什么时候该真的去联网。
 *
 * 触发点是「冷启动 + 回到前台」，但这两个时机都可能很密集（用户来回切应用），
 * 所以真实的网络请求由**间隔**节流。这里的函数是无副作用的纯判定：
 * 「现在这个时刻、上一次是那个时刻、间隔是这个」→ 要不要发请求。
 */

export type CheckInterval = 'launch' | '1d' | '3d' | '7d'

export const CHECK_INTERVALS: readonly CheckInterval[] = ['launch', '1d', '3d', '7d']

export const CHECK_INTERVAL_LABELS: Record<CheckInterval, string> = {
  launch: '每次启动',
  '1d': '1 天',
  '3d': '3 天',
  '7d': '7 天',
}

/** 默认一天一次：既不会让用户长期看不到更新，也远低于匿名 API 的 60 次/小时限流。 */
export const DEFAULT_CHECK_INTERVAL: CheckInterval = '1d'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 间隔对应的毫秒数。
 *
 * @param interval 用户选择的间隔。
 * @returns `launch` 返回 `0`（每次都放行），其余返回对应天数。
 */
export function checkIntervalMs(interval: CheckInterval): number {
  switch (interval) {
    case 'launch':
      return 0
    case '1d':
      return DAY_MS
    case '3d':
      return 3 * DAY_MS
    case '7d':
      return 7 * DAY_MS
  }
}

export type ShouldCheckArgs = {
  interval: CheckInterval
  /** 上一次检查**尝试**的时间戳（失败也记）；`null` 表示从未检查过。 */
  lastCheckAt: number | null
  now: number
}

/**
 * 现在该不该发起检查。
 *
 * 「上一次尝试」包含失败的那次（prd F2：失败静默，但要参与节流），
 * 否则网络不通时会变成每次切前台都重试。
 *
 * @returns 从未检查过、或距上次尝试已超过间隔时为 `true`。
 */
export function shouldCheckNow({ interval, lastCheckAt, now }: ShouldCheckArgs): boolean {
  if (lastCheckAt === null) return true

  return now - lastCheckAt >= checkIntervalMs(interval)
}

/** 把任意外部值收窄成间隔；不认识的值返回 `null`（调用方据此回落到默认间隔）。 */
export function normalizeCheckInterval(value: unknown): CheckInterval | null {
  return CHECK_INTERVALS.includes(value as CheckInterval) ? (value as CheckInterval) : null
}
