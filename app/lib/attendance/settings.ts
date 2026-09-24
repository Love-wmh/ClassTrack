/**
 * 「出勤统计」开关的**设备相关设置**（写进 localStorage 的 `class-track-attendance`）。
 *
 * 独立于 `class-track-storage`：它不该跟着备份 JSON 迁移到新设备，也不该牵动业务数据的
 * schema 版本与迁移逻辑（与 `mobileNavigationStore` / `updateStore` 同一约定）。
 *
 * 放在 `app/lib/attendance/` 而不是 store 里的原因：默认值与「外部输入怎么收窄」都是**纯逻辑**，
 * 要能被 vitest 直接钉住；store 只负责拿它去 merge 与落盘。
 */
export type AttendanceSettings = {
  /** 是否启用出勤能力（课表标记 + 数据看板出勤统计）。 */
  enabled: boolean
}

/**
 * 首次安装 / 存储里没有该字段时的默认值。
 *
 * **默认关闭**（用户 2026-09-24 口径）：全新设备与升级后的老设备一律关闭，
 * 「课表标记」与「看板出勤统计」都不出现；已存在本机的出勤数据原样保留，
 * 用户在个人中心打开开关后即可看到。
 */
export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  enabled: false,
}

/**
 * 把 localStorage 里的任意值收窄成合法设置。
 *
 * localStorage 是**外部输入**（手改、旧版本、别的应用写的同名键）：非布尔一律回落到
 * `fallback`，而不是做真假值转换 —— `'false'` / `0` 这类值按「没有设置过」处理，
 * 免得一个手改过的字符串把开关意外打开。
 *
 * @param stored 已解析出来的持久化对象；`null` / 非对象按「什么都没有」处理。
 * @param fallback 回落目标；默认就是首次安装的那套默认值（关闭）。
 * @returns 完整、合法的设置。
 */
export function normalizeAttendanceSettings(
  stored: unknown,
  fallback: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS
): AttendanceSettings {
  const source = (stored ?? {}) as Record<string, unknown>

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
  }
}
