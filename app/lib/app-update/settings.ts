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
 * 放在 `app/lib/app-update/` 而不是 store 里的原因：默认值与「外部输入怎么收窄」都是**纯逻辑**，
 * 要能被 vitest 直接钉住；store 只负责拿它去 merge 与落盘。
 */
export type AppUpdateSettings = {
  /** 用户选的更新通道；`null` 表示还没播种过（首次读到版本名时按安装包类型写一次，之后永久保持）。 */
  channel: UpdateChannel | null
  /** 总开关：关闭后不再联网检查、不再提示。 */
  autoCheck: boolean
  /** 发现新版本时是否发系统通知。 */
  notify: boolean
  interval: CheckInterval
  /** 上一次检查**尝试**的时间戳（失败也记，用于节流）。 */
  lastCheckAt: number | null
  /** 用户点过「跳过此版本」的版本号。 */
  skippedVersion: string | null
}

/**
 * 首次安装 / 存储里没有该字段时的默认值。
 *
 * **「发现新版本时发通知」默认关**（用户 2026-09-23 口径）：新版本照样在应用内弹出模态框提示，
 * 但不会主动往通知栏塞一条、也不会在首装时申请通知权限 —— 想要通知的用户自己打开开关，
 * 那时才申请权限。「自动检查更新」保持默认**开**。
 */
export const DEFAULT_UPDATE_SETTINGS: AppUpdateSettings = {
  channel: null,
  autoCheck: true,
  notify: false,
  interval: DEFAULT_CHECK_INTERVAL,
  lastCheckAt: null,
  skippedVersion: null,
}

/**
 * 把 localStorage 里的任意值收窄成合法设置。
 *
 * localStorage 是**外部输入**（手改、旧版本、别的应用写的同名键）：坏值一律逐字段回落到
 * `fallback`，而不是让一个非法通道值把检查逻辑带进未定义分支。
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
    lastCheckAt: typeof source.lastCheckAt === 'number' ? source.lastCheckAt : null,
    skippedVersion: typeof source.skippedVersion === 'string' ? source.skippedVersion : null,
  }
}
