import { useCallback, useEffect, useState } from 'react'
import { addWidgetSnapshotResumedListener, isNativeWidgetSnapshotAvailable, widgetSnapshotPlugin } from '~/lib/native-widget-snapshot'
import type { WidgetExactAlarmStatus } from '~/lib/native-widget-snapshot'

export type WidgetPrecisionState = {
  /** 当前环境是否支持桌面小工具与精度设置（仅 Android 原生为真）。 */
  supported: boolean
  /** 精确闹钟状态；尚未查询到时为 `null`。 */
  status: WidgetExactAlarmStatus | null
  /** 正在跳转系统设置页。 */
  isRequesting: boolean
  /** 跳转系统「闹钟与提醒」设置页；返回后由 `resumed` 事件自动刷新状态。 */
  requestExactAlarmPermission: () => Promise<void>
}

/**
 * 桌面小工具的精度等级（design-appendix D12）。
 *
 * 精度事实来源是**系统权限**，不是应用内的开关，因此这里只做两件事：查询真实状态、
 * 跳转系统设置页。刻意不在应用内维护一份「用户以为开着」的布尔值 —— 那会出现
 * 两处互相矛盾的状态。
 *
 * 状态在应用回到前台时重新查询：用户从系统设置页切回来的路径正好被它覆盖。
 */
export function useWidgetPrecision(): WidgetPrecisionState {
  const supported = isNativeWidgetSnapshotAvailable()
  const [status, setStatus] = useState<WidgetExactAlarmStatus | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)

  useEffect(() => {
    if (!supported) return

    let active = true
    const query = () => {
      void widgetSnapshotPlugin
        .getExactAlarmStatus()
        .then((next) => {
          if (active) setStatus(next)
        })
        .catch(() => {
          // 查询失败时保守地按「未获得精确能力」展示，而不是假装已开启。
          if (active) setStatus(null)
        })
    }

    query()
    const listener = addWidgetSnapshotResumedListener(query)

    return () => {
      active = false
      void listener.then((handle) => handle.remove())
    }
  }, [supported])

  const requestExactAlarmPermission = useCallback(async () => {
    if (!supported) return

    setIsRequesting(true)
    try {
      await widgetSnapshotPlugin.requestExactAlarmPermission()
    } catch {
      // 跳转失败（例如个别 ROM 没有该设置页）时什么都不做：用户仍可手动去系统设置授权，
      // 下一次前台刷新会读到真实状态。
    } finally {
      setIsRequesting(false)
    }
  }, [supported])

  return { supported, status, isRequesting, requestExactAlarmPermission }
}
