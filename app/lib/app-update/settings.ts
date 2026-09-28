import { normalizeChannel } from './channels'
import type { UpdateChannel } from './channels'
import { DEFAULT_CHECK_INTERVAL, normalizeCheckInterval } from './schedule'
import type { CheckInterval } from './schedule'

/**
 * 更新检测的**设备相关设置**（写进 localStorage 的 `class-track-update`）。
 *
 * 独立于 `class-track-storage`：它不该跟着备份 JSON 迁移到新设备，也不该牵动业务数据的
 * schema 版本与迁移逻辑（与 `mobileNavigationStore` 同一约定）。
 *
 * 放在 `app/lib/app-update/` 而不是 store 里的原因：默认值、「外部输入怎么收窄」与
 * 「存量值怎么提升」都是**纯逻辑**，要能被 vitest 直接钉住；store 只负责拿它去 merge 与落盘。
 */
export type AppUpdateSettings = {
  /** 用户选的更新通道；`null` 表示还没播种过（首次读到版本名时按安装包类型写一次，之后永久保持）。 */
  channel: UpdateChannel | null
  /** 总开关：关闭后不再联网检查、不再提示。 */
  autoCheck: boolean
  /** 发现新版本时是否发系统通知。 */
  notify: boolean
  /** 检查间隔。 */
  interval: CheckInterval
  /** 上一次**成功拿到结果**的时间戳；`null` 表示从未成功过。设置页展示的就是它。 */
  lastCheckAt: number | null
  /** 上一次**尝试**的时间戳（成功失败都记）；只用于失败后的短冷却，不展示给用户。 */
  lastAttemptAt: number | null
  /** 用户点过「跳过此版本」的版本号。 */
  skippedVersion: string | null
  /**
   * 该设备的间隔是否已经「定档」。
   *
   * - 用户手动改过间隔 → `true`；
   * - `applyLegacyIntervalMigration` 把旧默认值提升到新默认值之后 → 也置 `true`；
   * - `true` 之后，**默认值的变化永不再改写这台设备的间隔**。
   */
  intervalPinned: boolean
}

/**
 * 首次安装 / 存储里没有该字段时的默认值。
 *
 * **「发现新版本时发通知」默认关**（用户 2026-09-23 口径）：新版本照样在应用内弹出模态框提示，
 * 但不会主动往通知栏塞一条、也不会在首装时申请通知权限 —— 想要通知的用户自己打开开关，
 * 那时才申请权限。「自动检查更新」保持默认**开**，间隔默认 1 小时（2026-09-28 从 1 天收紧）。
 */
export const DEFAULT_UPDATE_SETTINGS: AppUpdateSettings = {
  channel: null,
  autoCheck: true,
  notify: false,
  interval: DEFAULT_CHECK_INTERVAL,
  lastCheckAt: null,
  lastAttemptAt: null,
  skippedVersion: null,
  intervalPinned: false,
}

/**
 * 2026-09-28 之前的默认间隔。
 *
 * 只在 `applyLegacyIntervalMigration` 里使用：存量设备存的 `1d` 基本都来自「从没改过设置」，
 * 而不是「专门选了 1 天」——旧默认值留着不动，就会让这次收紧对它们完全失效。
 */
const LEGACY_DEFAULT_INTERVAL: CheckInterval = '1d'

/**
 * 读一个时间戳字段。
 *
 * `typeof x === 'number'` 会放过 `NaN` / `Infinity`，而 `NaN` 参与比较恒为假，
 * 会让「间隔是否已过」永远判否 —— 检查静默停摆。所以这里额外要求有限数。
 */
function readTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 把 localStorage 里的任意值收窄成合法设置。
 *
 * localStorage 是**外部输入**（手改、旧版本、别的应用写的同名键）：坏值一律逐字段回落到
 * `fallback`，而不是让一个非法通道值把检查逻辑带进未定义分支。
 *
 * 注意这里**只做收窄，不做迁移**：旧默认值的提升在 `applyLegacyIntervalMigration` 里，
 * 两者分开才能各自被单测钉住。
 *
 * @param stored 已解析出来的持久化对象；`null` / 非对象按「什么都没有」处理。
 * @param fallback 逐字段回落的目标；默认就是首次安装的那套默认值。
 * @returns 完整、合法的设置。
 */
export function normalizeUpdateSettings(stored: unknown, fallback: AppUpdateSettings = DEFAULT_UPDATE_SETTINGS): AppUpdateSettings {
  const source = (stored ?? {}) as Record<string, unknown>

  return {
    channel: normalizeChannel(source.channel),
    autoCheck: typeof source.autoCheck === 'boolean' ? source.autoCheck : fallback.autoCheck,
    notify: typeof source.notify === 'boolean' ? source.notify : fallback.notify,
    interval: normalizeCheckInterval(source.interval) ?? fallback.interval,
    lastCheckAt: readTimestamp(source.lastCheckAt),
    lastAttemptAt: readTimestamp(source.lastAttemptAt),
    skippedVersion: typeof source.skippedVersion === 'string' ? source.skippedVersion : null,
    intervalPinned: typeof source.intervalPinned === 'boolean' ? source.intervalPinned : false,
  }
}

/**
 * 一次性把「旧默认间隔」提升到「新默认间隔」。
 *
 * 判据是「值等于旧默认 **且** 没有定档标记」：
 * - 存储里没有标记的设备，`1d` 只可能是旧默认值（默认值曾经就是 1 天）→ 提升到 1 小时，并置定档；
 * - 用户手动改过间隔（标记为真）的设备，选什么就是什么，一个字都不动；
 * - `launch` / `3d` / `7d` 只可能来自显式选择 → 不动。
 *
 * 幂等：提升后存的是新默认值，下次启动不会再命中这条分支。
 * 无法区分「在旧版本里专门选过 1 天」与「一直是旧默认」——按偏频繁的方向处理（1 小时），
 * 用户可随时改回去，这比让存量设备继续漏掉更新要好。
 *
 * @param settings 已收窄的合法设置。
 * @returns 提升后的设置；不需要提升时原样返回同一个对象。
 */
export function applyLegacyIntervalMigration(settings: AppUpdateSettings): AppUpdateSettings {
  if (settings.intervalPinned) return settings
  if (settings.interval !== LEGACY_DEFAULT_INTERVAL) return settings
  // 默认值与旧默认值相同的将来（若再改回 1 天）不需要这条迁移，避免无故置定档。
  if (DEFAULT_CHECK_INTERVAL === LEGACY_DEFAULT_INTERVAL) return settings

  return { ...settings, interval: DEFAULT_CHECK_INTERVAL, intervalPinned: true }
}
