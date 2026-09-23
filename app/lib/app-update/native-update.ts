import { App } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import { registerPlugin, WebPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/**
 * 更新检测用到的两个 Capacitor 插件的适配层。
 *
 * 为什么单独成模块（与 `native-widget-snapshot.ts` 同一约定）：业务组件不允许直接 import 原生插件，
 * 平台分发、插件不可用的兜底、错误码收窄都必须只在这一个地方发生。
 *
 * **本模块的所有函数都不抛错**：它们跑在「应用启动 / 回到前台」这条路径上，
 * 一次抛错就会变成用户可见的崩溃或噪音。失败一律用返回值表达（`null` / `false` / `'unsupported'`）。
 */

/** 通知渠道 id。Android 8+ 的通知必须有渠道，独立渠道也让用户可以单独关掉「应用更新」这类提醒。 */
export const UPDATE_NOTIFICATION_CHANNEL_ID = 'updates'

/**
 * 通知 id 固定：同一时刻只会存在一条「有新版本」通知。
 * 让 id 递增会在通知栏堆一串重复提醒。
 */
const UPDATE_NOTIFICATION_ID = 1

export type AppVersionInfo = {
  /** 安装包的 versionName，如 `1.0.10-beta`；它就是「当前版本」的真相来源。 */
  version: string
  /** versionCode，仅用于诊断展示。 */
  build: string
}

/**
 * 读取当前安装包的版本信息。
 *
 * @returns 版本名非空时返回信息；插件不可用或读失败返回 `null`（调用方据此静默禁用整个功能）。
 */
export async function readAppVersionInfo(): Promise<AppVersionInfo | null> {
  try {
    const info = await App.getInfo()
    const version = typeof info.version === 'string' ? info.version.trim() : ''
    if (!version) return null

    return { version, build: typeof info.build === 'string' ? info.build : '' }
  } catch {
    return null
  }
}

/**
 * 监听「应用回到前台」。
 *
 * 用 `@capacitor/app` 的 `appStateChange` 而不是 `document.visibilitychange`：
 * 前者是原生生命周期事件，Android WebView 在息屏/被系统回收时对后者并不可靠。
 *
 * @returns 监听句柄；拿不到事件的环境返回 `null`（调用方不要再尝试移除）。
 */
export async function addAppResumeListener(handler: () => void): Promise<PluginListenerHandle | null> {
  try {
    return await App.addListener('appStateChange', (state) => {
      if (state.isActive) handler()
    })
  } catch {
    return null
  }
}

/**
 * 本应用自己的原生插件（`AppUpdatePlugin.java`），目前只有一个方法：跳到通知设置页。
 *
 * 为什么要自己写：`@capacitor/local-notifications` 与 `@capacitor/app` 都没有打开系统设置页的能力，
 * 而「通知权限被拒」时必须给用户一条能自己走通的路。
 */
type AppUpdatePluginApi = {
  /** @returns `launched: false` 表示这个 ROM 上没有可用的设置页。 */
  openNotificationSettings(options: { channelId: string }): Promise<{ launched: boolean }>
}

/** 浏览器 / PWA 上没有这个插件，调用一律返回「没跳成」。 */
class AppUpdateWeb extends WebPlugin implements AppUpdatePluginApi {
  async openNotificationSettings(): Promise<{ launched: boolean }> {
    return { launched: false }
  }
}

export const appUpdatePlugin = registerPlugin<AppUpdatePluginApi>('AppUpdate', {
  web: () => Promise.resolve(new AppUpdateWeb()),
})

export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

/** Capacitor 的 `prompt-with-rationale` 与 `prompt` 对调用方是同一件事：还没决定。 */
function toNotificationPermission(display: string): NotificationPermission {
  if (display === 'granted') return 'granted'
  if (display === 'denied') return 'denied'
  return 'prompt'
}

/** 查询系统通知权限（Android 13+ 才需要授权，低版本恒为 `granted`）。 */
export async function readNotificationPermission(): Promise<NotificationPermission> {
  try {
    const status = await LocalNotifications.checkPermissions()
    return toNotificationPermission(status.display)
  } catch {
    return 'unsupported'
  }
}

/**
 * 申请系统通知权限。
 *
 * @returns 申请后的权限状态；插件不可用或调用失败返回 `'unsupported'`。
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  try {
    const status = await LocalNotifications.requestPermissions()
    return toNotificationPermission(status.display)
  } catch {
    return 'unsupported'
  }
}

/** 确保通知渠道存在。`createChannel` 对同 id 的重复调用是幂等的，失败也无需打扰用户。 */
async function ensureNotificationChannel(): Promise<void> {
  try {
    await LocalNotifications.createChannel({
      id: UPDATE_NOTIFICATION_CHANNEL_ID,
      name: '应用更新',
      description: '发现 ClassTrack 新版本时提醒',
      // 3 = DEFAULT：进通知栏但不抢占屏幕（上课时不该被弹窗打断）。
      importance: 3,
    })
  } catch {
    // 渠道已存在或系统不支持渠道时忽略。
  }
}

/**
 * 发一条「有新版本」通知。
 *
 * 不带 `schedule` 字段时插件走**立即投递**（`NotificationManager.notify`），
 * 不经过 AlarmManager，因此不需要精确闹钟能力。
 *
 * @returns 投递成功返回 `true`；权限未授予、插件不可用或调用失败返回 `false`。
 */
export async function sendUpdateNotification(version: string): Promise<boolean> {
  try {
    await ensureNotificationChannel()
    await LocalNotifications.schedule({
      notifications: [
        {
          id: UPDATE_NOTIFICATION_ID,
          // **必须显式关掉精确闹钟**（默认是 true）：我们要的是「立刻投递」，plugin 的
          // `doSchedule` 在 `isExactNotification` 为 true 且系统没给「闹钟与提醒」特殊访问时，
          // 会先 `startActivityForResult` 去弹系统设置页并**等结果回来**才继续 —— 于是这次调用
          // 永不 resolve、通知永不投递，用户还会莫名被拽到设置页（2026-09-23 在 API 37 模拟器上实测）。
          isExactNotification: false,
          title: 'ClassTrack 有新版本',
          body: `${version} 已发布，点击查看`,
          channelId: UPDATE_NOTIFICATION_CHANNEL_ID,
        },
      ],
    })
    return true
  } catch (error) {
    // 不静默吞掉：通知发不出去时，唯一的现场就是这行日志（真机验收正是靠它定位到插件的精确闹钟分支）。
    console.warn('[app-update] 发送更新通知失败', error)
    return false
  }
}

/**
 * 跳到本应用的通知设置页（原生实现，见 `AppUpdatePlugin.java`）。
 *
 * 优先直达「应用更新」这个渠道，用户能只开关这一类提醒；ROM 上没有该页面时原生会逐级回退。
 *
 * @returns 真的把设置页拉起来了返回 `true`；插件缺失、Activity 不在前台或这个 ROM 没有对应页面时返回 `false`。
 */
export async function openNotificationSettings(): Promise<boolean> {
  try {
    const result = await appUpdatePlugin.openNotificationSettings({ channelId: UPDATE_NOTIFICATION_CHANNEL_ID })
    return result.launched === true
  } catch (error) {
    console.warn('[app-update] 打开通知设置页失败', error)
    return false
  }
}
