/**
 * 更新检查的调度口径：什么时候该真的去联网。
 *
 * 触发点是「冷启动 + 回到前台」，但这两个时机都可能很密集（用户来回切应用），
 * 所以真实的网络请求由**间隔**节流。这里的函数是无副作用的纯判定：
 * 「现在这个时刻、上次成功是什么时候、上次尝试是什么时候、间隔是这个」→ 要不要发请求。
 *
 * **两个时间戳各管一件事**（别再合成一个，否则会退回「失败也消耗窗口」的老毛病）：
 * - `lastCheckAt` —— 上一次**成功拿到结果**的时刻，驱动间隔窗口；
 * - `lastAttemptAt` —— 上一次**尝试**的时刻（成功失败都写），只为失败冷却服务。
 *
 * 冷启动那次检查如果失败（断网、限流）而仍写 `lastCheckAt`，用户就会看到
 * 「回到前台什么都不发生，只有『立即检查』能拿到更新」—— 2026-09-28 上报的正是这个现象。
 */

export type CheckInterval = 'launch' | '1h' | '1d' | '3d' | '7d'

export const CHECK_INTERVALS: readonly CheckInterval[] = ['launch', '1h', '1d', '3d', '7d']

export const CHECK_INTERVAL_LABELS: Record<CheckInterval, string> = {
  launch: '每次启动',
  '1h': '1 小时',
  '1d': '1 天',
  '3d': '3 天',
  '7d': '7 天',
}

/**
 * 默认一小时。
 *
 * 2026-09-28 之前是 1 天，配合「失败也记账」的口径会让前台检查形同虚设
 * （测试版一天发好几个包，1 天的窗口永远追不上）。1 小时仍远低于匿名 API 的 60 次/小时。
 */
export const DEFAULT_CHECK_INTERVAL: CheckInterval = '1h'

/**
 * 失败后的冷却：上一次尝试失败时，这段时间内不再重试。
 *
 * 失败已经不消耗间隔窗口（改成「下次回到前台立即重试」），所以需要这道闸门兜住
 * 「断网 / 被限流时来回切前台」的场景，否则匿名限流额度（60 次/小时）会被打光。
 * 不暴露给用户：这是一个防御性常量，不是可选项。
 */
export const FAILURE_RETRY_COOLDOWN_MS = 60 * 1000

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * 间隔对应的毫秒数。
 *
 * @param interval 用户选择的间隔。
 * @returns `launch` 返回 `0`（每次都放行），其余返回对应时长。
 */
export function checkIntervalMs(interval: CheckInterval): number {
  switch (interval) {
    case 'launch':
      return 0
    case '1h':
      return HOUR_MS
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
  /** 上一次**成功**拿到结果的时间戳（驱动间隔窗口）；`null` 表示从未成功过。 */
  lastCheckAt: number | null
  /** 上一次**尝试**的时间戳（成功失败都记，驱动失败冷却）；`null` 表示从未检查过。 */
  lastAttemptAt: number | null
  now: number
  /** 已经有一次检查在进行中：任何触发都不放行，避免冷启动的双触发翻倍请求。 */
  inFlight?: boolean
  /** 手动「立即检查」：忽略间隔与失败冷却（用户明确点了按钮就要有反应）。 */
  manual?: boolean
}

/**
 * 「上一次尝试是失败的」——上一次尝试比上一次成功更晚发生（或成功后一次都没有过）。
 *
 * 不额外落一个「上次是否失败」的字段：两个时间戳的先后关系已经把这个信息表达完了，
 * 多一个布尔就会多一处可能不一致的状态。
 */
function isFailedAttemptPending(lastCheckAt: number | null, lastAttemptAt: number | null): boolean {
  if (lastAttemptAt === null) return false
  return lastCheckAt === null || lastAttemptAt > lastCheckAt
}

/**
 * 现在该不该发起检查。判决顺序本身是契约（`schedule.test.ts` 逐条钉住）：
 *
 * 1. `manual` → 放行（手动忽略一切节流）；
 * 2. `inFlight` → 拦住（重入保护）；
 * 3. 上一次是失败的尝试：距它不足 `FAILURE_RETRY_COOLDOWN_MS` → 拦住（失败冷却）；
 *    出了冷却 → **直接放行**（失败不消耗间隔窗口，回到前台就重试 —— 2026-09-28 口径）；
 * 4. 从未尝试过（两个时间戳都是 `null`）→ 放行；
 * 5. 时间戳大于 `now`（用户改过系统时间）→ 放行，否则会永久静默；
 * 6. 距上一次成功已超过间隔 → 放行。
 *
 * @returns 该发起检查时为 `true`。
 */
export function shouldCheckNow({ interval, lastCheckAt, lastAttemptAt, now, inFlight = false, manual = false }: ShouldCheckArgs): boolean {
  if (manual) return true
  if (inFlight) return false

  // 上一次尝试是失败的：只受冷却约束，**不看间隔**。否则冷启动失败 + 1 天档就会退回
  // 「回到前台永远不检查」的老毛病。
  if (isFailedAttemptPending(lastCheckAt, lastAttemptAt) && lastAttemptAt !== null) {
    // 时间戳在未来（改过系统时间）：不让冷却把自己锁到时钟追上为止。
    if (lastAttemptAt > now) return true
    return now - lastAttemptAt >= FAILURE_RETRY_COOLDOWN_MS
  }

  // 从未尝试过（`lastAttemptAt` 为 `null` 时 `lastCheckAt` 必然也是 `null`）：立刻检查。
  if (lastCheckAt === null) return true

  // 时间戳在未来：时钟被改过，按「已经过完间隔」处理，不让检查永久卡死。
  if (lastCheckAt > now) return true
  return now - lastCheckAt >= checkIntervalMs(interval)
}

/** 把任意外部值收窄成间隔；不认识的值返回 `null`（调用方据此回落到默认间隔）。 */
export function normalizeCheckInterval(value: unknown): CheckInterval | null {
  return CHECK_INTERVALS.includes(value as CheckInterval) ? (value as CheckInterval) : null
}
