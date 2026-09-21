import { useCallback, useEffect, useRef, useState } from 'react'
import { isNativeWidgetSnapshotAvailable, widgetSnapshotPlugin } from '~/lib/native-widget-snapshot'
import type { WidgetPresetId } from '~/lib/native-widget-snapshot'
import {
  pinOutcomeMessage,
  resolvePinFinalOutcome,
  resolvePinModalState,
  resolvePinProbeOutcome,
  resolvePinPollOutcome,
  resolvePinStartOutcome,
  type WidgetPinModalState,
  type WidgetPinOutcome,
} from '../widgetPinPresets'

/**
 * 等待系统确认的轮询节奏。
 *
 * 为什么是轮询而不是事件：pin 的确认发生在 launcher 前台、我们大概率处于后台，
 * 而既有插件只投递 `resumed` 事件；轮询只在面板可见期间进行，逻辑简单且不依赖事件投递。
 */
const POLL_INTERVAL_MS = 1000
const POLL_ATTEMPTS = 10

/**
 * 头几次确认轮询里顺路问一次快探针（原生判定窗口是 2 秒）。
 *
 * 探针的作用是**别让用户干等**：命中就立刻切失败态，但仍继续等确认回调（它不是终态）。
 */
const PROBE_POLLS = 3

/** 成功态模态停留多久后自动收起（用户已经看到"已添加"，不必手动关）。 */
const SUCCESS_MODAL_LINGER_MS = 1500

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
  /** 醒目标态框当前该显示什么（点击后立刻变 `'requesting'`）。 */
  modal: WidgetPinModalState
  /** 关掉失败态标态框（不再重复打扰同一次失败）。 */
  dismissModal: () => void
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
 * 2. 失败**一旦判定出来就立刻**给反馈：被取消/不支持是即时的；「系统压根没弹确认界面」由原生快探针在
 *    约 2 秒判定（实测 ColorOS 起确认页却从不置前）；最后 10 秒无回调兜底。
 * 3. 探针命中**不是终态**：仍然继续等确认回调，真成功了要翻成成功并收起模态框。
 */
export function useWidgetPin(): WidgetPinState {
  const supported = isNativeWidgetSnapshotAvailable()
  const [pending, setPending] = useState<WidgetPresetId | null>(null)
  const [outcome, setOutcome] = useState<WidgetPinOutcome>('idle')
  const [added, setAdded] = useState<WidgetPresetId | null>(null)
  const [modalDismissed, setModalDismissed] = useState(false)
  const pendingRef = useRef<WidgetPresetId | null>(null)

  const modal = resolvePinModalState(outcome, modalDismissed)

  // 成功态自动收起：用户已经看到结果，不必再手动点一次。
  useEffect(() => {
    if (modal !== 'added') return
    const timer = setTimeout(() => setModalDismissed(true), SUCCESS_MODAL_LINGER_MS)
    return () => clearTimeout(timer)
  }, [modal])

  const dismissModal = useCallback(() => setModalDismissed(true), [])

  const pin = useCallback(async (preset: WidgetPresetId) => {
    if (pendingRef.current !== null) return
    pendingRef.current = preset
    setPending(preset)
    setAdded(null)
    setModalDismissed(false)
    // 先给中性态：模态框**立刻**出现（"正在尝试添加"），而不是等原生返回后才动。
    setOutcome('requesting')
    try {
      const result = await widgetSnapshotPlugin.requestPinWidget({ preset })
      const start = resolvePinStartOutcome(result)
      if (start !== 'requesting') {
        setOutcome(start)
        return
      }

      // 确认回调 10 次 × 1s；前 3 次顺路问一次快探针 —— 它一旦命中就立刻切失败态，
      // `probeFired` 记住「探针已经给过更具体的结论」，避免最后一轮把它降级成兜底文案。
      let probeFired = false
      // 但**不中断**轮询（回调可能稍后才到，那时必须翻成成功）。
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        const confirmation = await widgetSnapshotPlugin.consumePinResult()
        if (confirmation.confirmed) {
          setAdded(preset)
          setOutcome(resolvePinPollOutcome(confirmation))
          return
        }

        if (attempt < PROBE_POLLS) {
          const probe = resolvePinProbeOutcome(await widgetSnapshotPlugin.getPinAttempt())
          if (probe === 'no_confirmation') {
            // 推断：系统没有弹出确认界面。切失败态让用户马上有路可走（文案里也说明了这是推断）。
            probeFired = true
            setOutcome('no_confirmation')
          }
        }
        await delay(POLL_INTERVAL_MS)
      }
      // 等不到确认：不是错误，是有些桌面会静默吞掉请求 —— 如实告知并给手动步骤。
      // **不要覆盖已经给出的更具体结论**：探针已经说过「系统没有弹出确认界面」时，那句更可行动
      // （它告诉用户先去把可能存在的确认界面点完），不能被这条兜底文案降级掉。
      setOutcome(resolvePinFinalOutcome(probeFired))
    } catch {
      // 原生侧拒绝（例如预设标识非法）不该弹红错：用户看到的仍然是一条可行动的说明。
      setOutcome('unsupported')
    } finally {
      pendingRef.current = null
      setPending(null)
    }
  }, [])

  return { supported, pending, outcome, message: pinOutcomeMessage(outcome), added, modal, dismissModal, pin }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
