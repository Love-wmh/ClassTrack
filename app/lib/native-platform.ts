import { Capacitor } from '@capacitor/core'

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform()
}

/**
 * 是不是**安卓客户端**（不是「原生平台」，也不是「插件是否注册」）。
 *
 * 用途：判断该不该走安卓专属的收窄口径（导入方式列表、加桌引导）。
 * 与 `isNativeCourseImportAvailable()` 的区别很重要：后者还要求 `CourseImport` 插件已注册，
 * 而收窄必须覆盖「这所学校压根没有原生适配器」的情形（那时插件在、适配器不在）。
 *
 * @returns 安卓客户端为 `true`；浏览器、PWA、iOS 均为 `false`。
 */
export function isAndroidApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.getPlatform() === 'android'
}
