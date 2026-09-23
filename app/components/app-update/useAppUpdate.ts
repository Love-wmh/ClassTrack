import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UPDATE_CHANNEL_LABELS, resolveUpdate, seedChannel } from '~/lib/app-update/channels'
import type { UpdateCandidate, UpdateChannel } from '~/lib/app-update/channels'
import { fetchReleaseCandidates } from '~/lib/app-update/releases-api'
import { shouldCheckNow } from '~/lib/app-update/schedule'
import type { CheckInterval } from '~/lib/app-update/schedule'
import {
  addAppResumeListener,
  readAppVersionInfo,
  openNotificationSettings,
  readNotificationPermission,
  requestNotificationPermission,
  sendUpdateNotification,
} from '~/lib/app-update/native-update'
import type { NotificationPermission } from '~/lib/app-update/native-update'
import { isAndroidApp } from '~/lib/native-platform'
import { useUpdateStore } from '~/store/updateStore'

/**
 * 更新检测的 React 侧入口。
 *
 * 两个消费方共用它：
 * - `UpdateCheckRunner`（挂在 `app/root.tsx`）传 `autoCheck: true`，负责冷启动 / 回前台的自动检查；
 * - `AppUpdateSettings`（个人中心）不传，只用设置项、通知权限与「立即检查」。
 *
 * 自动检查**只由 Runner 那一份实例驱动**（`autoCheck` 选项），否则设置页一打开就会多跑一轮调度。
 */

export type AppUpdateApi = {
  /** 当前环境是否支持更新检测（仅 Android 原生为真）。 */
  supported: boolean
  /** 当前安装版本名；从原生读到之前为 `null`。 */
  currentVersion: string | null
  /** 版本信息读不到（插件不可用）：整张设置卡片与模态框都不该出现（prd F1）。 */
  versionUnavailable: boolean
  /** 已播种的更新通道；`null` 表示还没读到版本名。 */
  channel: UpdateChannel | null
  /** 通道的中文名，供只读展示。 */
  channelLabel: string
  autoCheck: boolean
  notify: boolean
  interval: CheckInterval
  isChecking: boolean
  lastCheckAt: number | null
  /** 系统通知权限；未查询到时为 `null`。 */
  notificationPermission: NotificationPermission | null
  /** 待提示的候选版本；模态框由 `UpdateCheckRunner` 渲染。 */
  candidate: UpdateCandidate | null
  setChannel: (channel: UpdateChannel) => void
  setAutoCheck: (enabled: boolean) => void
  setNotifyEnabled: (enabled: boolean) => Promise<void>
  setCheckInterval: (interval: CheckInterval) => void
  /** 手动检查：忽略间隔与「跳过此版本」，并且不发通知（用户正看着界面，不需要第二条提醒）。 */
  checkNow: () => Promise<void>
  /** 「稍后」：关掉模态框，下次检查仍会提示。 */
  dismissCandidate: () => void
  /** 「跳过此版本」：永久不再自动提示这个版本。 */
  skipCandidate: () => void
  /** 「前往系统设置」：拉起本应用的通知设置页；返回 `false` 表示这个 ROM 没有对应页面。 */
  openNotificationSettings: () => Promise<boolean>
}

type UseAppUpdateOptions = {
  /** 是否由这个实例驱动自动检查（只有挂在根组件的那一份该传 `true`）。 */
  autoCheck?: boolean
}

export function useAppUpdate({ autoCheck = false }: UseAppUpdateOptions = {}): AppUpdateApi {
  const supported = isAndroidApp()
  const channel = useUpdateStore((state) => state.channel)
  const autoCheckEnabled = useUpdateStore((state) => state.autoCheck)
  const notify = useUpdateStore((state) => state.notify)
  const interval = useUpdateStore((state) => state.interval)
  const lastCheckAt = useUpdateStore((state) => state.lastCheckAt)
  const currentVersion = useUpdateStore((state) => state.currentVersion)
  const versionUnavailable = useUpdateStore((state) => state.versionUnavailable)
  const isChecking = useUpdateStore((state) => state.isChecking)
  const candidate = useUpdateStore((state) => state.pendingCandidate)
  const setChannel = useUpdateStore((state) => state.setChannel)
  const setAutoCheck = useUpdateStore((state) => state.setAutoCheck)
  const setCheckInterval = useUpdateStore((state) => state.setCheckInterval)

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null)

  /**
   * 读安装包版本并播种通道。
   *
   * 播种只发生在这里，而且 `seedChannelOnce` 内部判「存储里有没有值」——
   * 所以测试版包升级成正式版包之后通道仍是「全部」，不会被安装包类型改写。
   */
  const loadVersion = useCallback(async (): Promise<string | null> => {
    const info = await readAppVersionInfo()
    if (!info) {
      useUpdateStore.getState().setVersionUnavailable(true)
      return null
    }

    const store = useUpdateStore.getState()
    store.setCurrentVersion(info.version)
    store.seedChannelOnce(info.version)

    return info.version
  }, [])

  const runCheck = useCallback(
    async (manual: boolean) => {
      const store = useUpdateStore.getState()
      if (!supported || !store.autoCheck) return

      // 开发环境不打真接口：热更新会让这个 effect 反复触发，徒增噪声。手动检查仍然可用。
      if (!manual && import.meta.env.DEV) return

      const version = store.currentVersion ?? (await loadVersion())
      if (!version) return

      const now = Date.now()
      if (!manual && !shouldCheckNow({ interval: store.interval, lastCheckAt: store.lastCheckAt, now })) return

      // 先记尝试时间再发请求：失败也要参与节流，否则断网时会变成每次切前台都重试。
      const attempt = useUpdateStore.getState()
      attempt.markChecked(now)
      attempt.setIsChecking(true)

      try {
        const result = await fetchReleaseCandidates()
        if (!result.ok) {
          if (manual) toast.error('检查更新失败，请稍后再试')
          return
        }

        const found = resolveUpdate({
          candidates: result.candidates,
          channel: seedChannel(attempt.channel, version),
          currentVersion: version,
          skippedVersion: attempt.skippedVersion,
          ignoreSkipped: manual,
        })

        if (!found) {
          if (manual) toast.success('已是最新版本')
          return
        }

        attempt.setPendingCandidate(found)
        if (manual || !attempt.notify) return

        // 首次要发通知时申请权限（Android 13+）。被拒时不改开关：用户没有做任何操作，
        // 静默把开关翻成关会让人莫名；设置页会显示「系统通知权限未开启」的提示。
        let permission = await readNotificationPermission()
        if (permission === 'prompt') permission = await requestNotificationPermission()
        setNotificationPermission(permission)
        if (permission !== 'granted') return

        await sendUpdateNotification(found.version)
      } finally {
        useUpdateStore.getState().setIsChecking(false)
      }
    },
    [loadVersion, supported]
  )

  useEffect(() => {
    if (!autoCheck || !supported) return

    let active = true
    const listener = addAppResumeListener(() => {
      void runCheck(false)
    })

    void loadVersion().then((version) => {
      if (active && version) void runCheck(false)
    })

    return () => {
      active = false
      void listener.then((handle) => handle?.remove())
    }
  }, [autoCheck, supported, loadVersion, runCheck])

  useEffect(() => {
    if (!supported) return
    // 用 `.then(setState)` 而不是调用一个内部 setState 的 async 函数：本仓库把「effect 内同步 setState」
    // 设为 error（react-hooks/set-state-in-effect），回调形态既满足规则，也让 setState 发生在挂载之后。
    void readNotificationPermission().then(setNotificationPermission)

    // 用户可能刚在系统设置里改完通知权限，回到前台要重新查一次（与 useWidgetPrecision 同一处理）。
    const listener = addAppResumeListener(() => {
      void readNotificationPermission().then(setNotificationPermission)
    })

    return () => {
      void listener.then((handle) => handle?.remove())
    }
  }, [supported])

  const setNotifyEnabled = useCallback(async (enabled: boolean) => {
    const store = useUpdateStore.getState()
    if (!enabled) {
      store.setNotify(false)
      return
    }

    const permission = await requestNotificationPermission()
    setNotificationPermission(permission)

    if (permission === 'granted') {
      store.setNotify(true)
      return
    }

    // 被拒就把开关退回关闭（prd F5），避免开关显示「开」而实际发不出任何东西。
    store.setNotify(false)
    toast.error('通知权限被拒绝。请在系统设置 → 应用 → ClassTrack → 通知里允许。')
  }, [])

  const checkNow = useCallback(async () => {
    const store = useUpdateStore.getState()
    // 总开关关闭时连手动检查也不联网（prd F2）。
    if (!store.autoCheck) {
      toast.error('自动检查更新已关闭，请先打开开关')
      return
    }

    await runCheck(true)
  }, [runCheck])

  const dismissCandidate = useCallback(() => {
    useUpdateStore.getState().setPendingCandidate(null)
  }, [])

  const openNotificationSettingsFromSettings = useCallback(async (): Promise<boolean> => {
    const launched = await openNotificationSettings()
    if (!launched) {
      // 少数 ROM 没有这一页：如实给出手动路径，而不是让按钮点了没反应。
      toast.error('没能打开系统设置页，请手动进入「系统设置 → 应用 → ClassTrack → 通知」。')
    }
    return launched
  }, [])
  const skipCandidate = useCallback(() => {
    const store = useUpdateStore.getState()
    if (store.pendingCandidate) store.skipVersion(store.pendingCandidate.version)
    store.setPendingCandidate(null)
  }, [])

  return {
    supported,
    currentVersion,
    versionUnavailable,
    channel,
    channelLabel: channel ? UPDATE_CHANNEL_LABELS[channel] : '未设置',
    autoCheck: autoCheckEnabled,
    notify,
    interval,
    isChecking,
    lastCheckAt,
    notificationPermission,
    candidate,
    setChannel,
    setAutoCheck,
    setNotifyEnabled,
    setCheckInterval,
    checkNow,
    dismissCandidate,
    skipCandidate,
    openNotificationSettings: openNotificationSettingsFromSettings,
  }
}
