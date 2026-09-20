import { useCallback, useState } from 'react'
import { isNativeWidgetSnapshotAvailable, widgetSnapshotPlugin } from '~/lib/native-widget-snapshot'
import type { WidgetPresetId } from '~/lib/native-widget-snapshot'
import { WIDGET_PIN_CANCELLED_HINT, WIDGET_PIN_MANUAL_HINT } from '../widgetPinPresets'

export type WidgetPinState = {
  /** 当前环境是否支持应用内添加（仅 Android 原生为真）。 */
  supported: boolean
  /** 正在请求中的预设 id；`null` 表示空闲（用于禁用按钮、避免连点）。 */
  pending: WidgetPresetId | null
  /** 最近一次请求的结果文案；`null` 表示还没请求过、或上次成功了。 */
  message: string | null
  /** 最近一次成功的预设 id；成功时卡片上显示「已添加到桌面」。 */
  added: WidgetPresetId | null
  /** 按预设请求添加。 */
  pin: (preset: WidgetPresetId) => Promise<void>
}

/**
 * 应用内「添加到桌面」。
 *
 * 只做三件事：查询能力、调原生、把结果翻译成一句人话。**不做任何乐观 UI** ——
 * 是否真的放下由 launcher 决定，因此必须在原生返回之后再说结果（`requested === false` 就是没放下）。
 */
export function useWidgetPin(): WidgetPinState {
  const supported = isNativeWidgetSnapshotAvailable()
  const [pending, setPending] = useState<WidgetPresetId | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [added, setAdded] = useState<WidgetPresetId | null>(null)

  const pin = useCallback(
    async (preset: WidgetPresetId) => {
      if (pending !== null) return
      setPending(preset)
      setMessage(null)
      setAdded(null)
      try {
        const result = await widgetSnapshotPlugin.requestPinWidget({ preset })
        if (!result.supported) {
          setMessage(WIDGET_PIN_MANUAL_HINT)
          return
        }
        if (!result.requested) {
          setMessage(WIDGET_PIN_CANCELLED_HINT)
          return
        }
        setAdded(preset)
      } catch {
        // 原生侧拒绝（例如预设标识非法）不该弹红错：用户看到的仍然是一条可行动的说明。
        setMessage(WIDGET_PIN_MANUAL_HINT)
      } finally {
        setPending(null)
      }
    },
    [pending]
  )

  return { supported, pending, message, added, pin }
}
