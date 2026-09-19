import { Capacitor, registerPlugin, WebPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/**
 * 桌面小工具插件的错误码。
 *
 * 与 `native-course-import.ts` 的 `CourseImportErrorCode` 保持同一风格：
 * 原生侧 `reject` 时必须带上其中一个码，Web 侧据此给出可行动提示。
 */
export type WidgetSnapshotErrorCode =
  /** 当前环境没有该原生插件（浏览器 / PWA / iOS）。 */
  | 'UNAVAILABLE'
  /** 负载不是合法快照：JSON 解析失败、schema 版本不符、字段类型错误。 */
  | 'INVALID_PAYLOAD'
  /** 负载超过原生侧的字节上限。 */
  | 'PAYLOAD_TOO_LARGE'
  /** 写入 SharedPreferences 失败。 */
  | 'STORAGE_ERROR'
  /** 写入成功但触发小工具刷新失败。 */
  | 'REFRESH_ERROR'

/** 未授权时的错误码，`code` 用于程序分支，`message` 用于展示。 */
export class WidgetSnapshotError extends Error {
  readonly code: WidgetSnapshotErrorCode

  constructor(code: WidgetSnapshotErrorCode, message: string) {
    super(message)
    this.name = 'WidgetSnapshotError'
    this.code = code
  }
}

const KNOWN_ERROR_CODES: WidgetSnapshotErrorCode[] = [
  'UNAVAILABLE',
  'INVALID_PAYLOAD',
  'PAYLOAD_TOO_LARGE',
  'STORAGE_ERROR',
  'REFRESH_ERROR',
]

/** 精确闹钟（L3 精度层）的可用性。 */
export type WidgetExactAlarmStatus = {
  /** 该 Android 版本是否需要「闹钟与提醒」特殊访问（API 31+ 才需要）。 */
  available: boolean
  /** 当前是否已获得授权。未授权时原生会静默回退到不精确的边界刷新。 */
  exact: boolean
}

/** 跳转系统设置页的结果。 */
export type WidgetExactAlarmRequestResult = {
  /** 是否真的拉起了系统设置页。 */
  launched: boolean
  /** 拉起设置页时已知的授权状态（用户授权后需重新查询）。 */
  exact: boolean
}

export interface WidgetSnapshotPlugin {
  /** 推送一份快照 JSON；只有落盘成功才 resolve。 */
  pushSnapshot(options: { snapshotJson: string }): Promise<void>
  /** 读取并清空「点击小工具时携带的待跳转路由」。 */
  consumePendingRoute(): Promise<{ route: string | null }>
  /** 查询精确闹钟授权状态。 */
  getExactAlarmStatus(): Promise<WidgetExactAlarmStatus>
  /** 跳转系统「闹钟与提醒」设置页；不在应用内自行请求或伪造授权。 */
  requestExactAlarmPermission(): Promise<WidgetExactAlarmRequestResult>
  /** 订阅原生事件；原生侧在 `handleOnResume()` 中发出 `resumed`。 */
  addListener(eventName: 'resumed', listenerFunc: () => void): Promise<PluginListenerHandle>
}

/**
 * 浏览器 / PWA 下的兜底实现。
 *
 * 同步逻辑在 Web 上整体 no-op（调用方先判断 `isNativeWidgetSnapshotAvailable()`），
 * 因此这里只需要保证「万一被调用也不会抛出未捕获异常」。
 */
class WidgetSnapshotWeb extends WebPlugin implements WidgetSnapshotPlugin {
  async pushSnapshot(): Promise<void> {
    throw new WidgetSnapshotError('UNAVAILABLE', '当前环境不支持桌面小工具，课表数据只在 Android 应用内同步。')
  }

  async consumePendingRoute(): Promise<{ route: string | null }> {
    return { route: null }
  }

  async getExactAlarmStatus(): Promise<WidgetExactAlarmStatus> {
    return { available: false, exact: false }
  }

  async requestExactAlarmPermission(): Promise<WidgetExactAlarmRequestResult> {
    return { launched: false, exact: false }
  }
}

export const widgetSnapshotPlugin = registerPlugin<WidgetSnapshotPlugin>('WidgetSnapshot', {
  web: () => Promise.resolve(new WidgetSnapshotWeb()),
})

/**
 * 判断当前环境是否具备桌面小工具同步能力。
 *
 * 只有 Android 且原生插件已注册时为真；其余环境（浏览器、PWA、iOS）返回 false，
 * 调用方必须据此完全跳过同步逻辑。
 *
 * @returns 是否可用。
 */
export function isNativeWidgetSnapshotAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('WidgetSnapshot')
}

/**
 * 读取 bridge 错误中的稳定错误码。
 *
 * @param error 任意抛出物。
 * @returns 已知错误码；无法识别时返回 `undefined`。
 */
export function getWidgetSnapshotErrorCode(error: unknown): WidgetSnapshotErrorCode | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined

  const code = error.code
  if (typeof code !== 'string') return undefined
  return KNOWN_ERROR_CODES.includes(code as WidgetSnapshotErrorCode) ? (code as WidgetSnapshotErrorCode) : undefined
}

/**
 * 把 bridge 错误转成用户可读的中文提示。
 *
 * @param error 任意抛出物。
 * @returns 提示文案。
 */
export function getWidgetSnapshotErrorMessage(error: unknown): string {
  switch (getWidgetSnapshotErrorCode(error)) {
    case 'UNAVAILABLE':
      return '当前环境不支持桌面小工具同步。'
    case 'PAYLOAD_TOO_LARGE':
      return '课表数据过大，桌面小工具同步失败。'
    case 'INVALID_PAYLOAD':
      return '课表数据格式异常，桌面小工具同步失败。'
    case 'STORAGE_ERROR':
      return '桌面小工具数据写入失败，请稍后重试。'
    case 'REFRESH_ERROR':
      return '桌面小工具刷新失败，请稍后重试。'
    default:
      return '桌面小工具同步失败。'
  }
}

/**
 * 订阅「应用回到前台」事件。
 *
 * 原生侧在 `handleOnResume()` 中通过 `notifyListeners('resumed')` 通知 Web 层，
 * 因此不需要额外引入 `@capacitor/app` 依赖。
 *
 * @param listener 回到前台时触发的回调。
 * @returns 监听句柄，调用 `remove()` 取消订阅。
 */
export function addWidgetSnapshotResumedListener(listener: () => void): Promise<PluginListenerHandle> {
  return widgetSnapshotPlugin.addListener('resumed', listener)
}
