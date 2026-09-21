import { useCallback, useRef, useState } from 'react'
import { isNativeWidgetSnapshotAvailable, widgetSnapshotPlugin } from '~/lib/native-widget-snapshot'
import type { WidgetPresetId } from '~/lib/native-widget-snapshot'
import { pinOutcomeMessage, resolvePinPollOutcome, resolvePinStartOutcome, type WidgetPinOutcome } from '../widgetPinPresets'

/**
 * 等待系统确认的轮询节奏。
 *
 * 为什么是轮询而不是事件：pin 的确认发生在 launcher 前台、我们大概率处于后台，
 * 而既有插件只投递 `resumed` 事件；轮询只在面板可见期间进行，逻辑简单且不依赖事件投递。
 */
const POLL_INTERVAL_MS = 1000
const POLL_ATTEMPTS = 10

export type WidgetPinState = {
  /** 当前环境是否支持应用内添加（仅 Android 原生为真）。 */
  supported: boolean
  /** 正在请求中的预设 id；`null` 表示空闲（用于禁用按钮、避免连点）。 */
  pending: WidgetPresetId | null
  /** 这次操作的状态；`'added'` 只可能来自系统的确认回调。 */
  outcome: WidgetPinOutcome
  /** 与 `outcome` 对应的提示文案；`null` 表示这一状态下不给提示。 */
  message: string | null
  /** 已**确认**放下的预设 id；`'added'` 之后卡片上显示「已添加到桌面」。 */
  added: WidgetPresetId | null
  /** 按预设请求添加。 */
  pin: (preset: WidgetPresetId) => Promise<void>
}

/**
 * 应用内「添加到桌面」。
 *
 * 链路：请求 → **等系统的确认回调** → 才说「已添加」。`requestPinAppWidget` 的返回值毫无意义
 * （它只表示"请求已受理"），真机上实测出现过"受理了但一个小工具都没放下"却已经显示「✓ 已添加」
 * —— 那是对用户撒谎，因此这里绝不乐观 UI：
 *
 * 1. 只有 `consumePinResult()` 报 `confirmed` 才算成功；
 * 2. 等满 10 秒仍未确认 → 如实说「系统没有完成添加」并把手动步骤摆出来。
 */
export function useWidgetPin(): WidgetPinState {
  const supported = isNativeWidgetSnapshotAvailable()
  const [pending, setPending] = useState<WidgetPresetId | null>(null)
  const [outcome, setOutcome] = useState<WidgetPinOutcome>('idle')
  const [added, setAdded] = useState<WidgetPresetId | null>(null)
  const pendingRef = useRef<WidgetPresetId | null>(null)

  const applyOutcome = useCallback((next: WidgetPinOutcome) => {
    setOutcome(next)
  }, [])

  const pin = useCallback(
    async (preset: WidgetPresetId) => {
      if (pendingRef.current !== null) return
      pendingRef.current = preset
      setPending(preset)
      setAdded(null)
      setOutcome('idle')
      try {
        const result = await widgetSnapshotPlugin.requestPinWidget({ preset })
        const start = resolvePinStartOutcome(result)
        if (start !== 'requesting') {
          applyOutcome(start)
          return
        }
        // 已请求：进入「等待系统确认」。中间态不发文案之外的任何信号（尤其不显示「已添加」）。
        applyOutcome('requesting')

        for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
          const confirmation = await widgetSnapshotPlugin.consumePinResult()
          if (confirmation.confirmed) {
            setAdded(preset)
            applyOutcome(resolvePinPollOutcome(confirmation))
            return
          }
          await delay(POLL_INTERVAL_MS)
        }
        // 等不到确认：不是错误，是有些桌面会静默吞掉请求 —— 如实告知并给手动步骤。
        applyOutcome(resolvePinPollOutcome({ confirmed: false, appWidgetId: null }))
      } catch {
        // 原生侧拒绝（例如预设标识非法）不该弹红错：用户看到的仍然是一条可行动的说明。
        applyOutcome('unsupported')
      } finally {
        pendingRef.current = null
        setPending(null)
      }
    },
    [applyOutcome]
  )

  return { supported, pending, outcome, message: pinOutcomeMessage(outcome), added, pin }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
