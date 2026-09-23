import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { normalizeChannel, seedChannel } from '~/lib/app-update/channels'
import type { UpdateCandidate, UpdateChannel } from '~/lib/app-update/channels'
import { DEFAULT_CHECK_INTERVAL, normalizeCheckInterval } from '~/lib/app-update/schedule'
import type { CheckInterval } from '~/lib/app-update/schedule'

/**
 * 更新检测的设置与应用内提示状态。
 *
 * 为什么独立成一个 store（而不是塞进 `useClassStore`）：这里的每一项都是**设备相关**的偏好，
 * 不该跟着备份 JSON 迁移到新设备，也不该牵动 `class-track-storage` 的 schema 版本与迁移逻辑。
 * 与 `mobileNavigationStore` 同一约定。
 */

export const UPDATE_STORAGE_KEY = 'class-track-update'

/** 会被写进 localStorage 的部分。 */
export type AppUpdateSettings = {
  /** 用户选的更新通道；`null` 表示还没播种过（首次读到版本名时按安装包类型写一次，之后永久保持）。 */
  channel: UpdateChannel | null
  /** 总开关：关闭后不再联网检查、不再提示（prd F2）。 */
  autoCheck: boolean
  /** 发现新版本时是否发系统通知。 */
  notify: boolean
  interval: CheckInterval
  /** 上一次检查**尝试**的时间戳（失败也记，用于节流）。 */
  lastCheckAt: number | null
  /** 用户点过「跳过此版本」的版本号。 */
  skippedVersion: string | null
}

/** 只在本次会话内有效的状态，**不落盘**（刷新后回到初始值）。 */
export type AppUpdateSession = {
  /** 当前安装版本名；从原生读到之前为 `null`。 */
  currentVersion: string | null
  /** 版本信息读取失败（插件不可用 / 异常）：此时整个功能静默禁用（prd F1）。 */
  versionUnavailable: boolean
  isChecking: boolean
  /** 待提示的候选版本；模态框读它（挂在 `app/root.tsx` 的那一份）。 */
  pendingCandidate: UpdateCandidate | null
}

type AppUpdateActions = {
  /** 通道播种：只在存储里没有值时写一次，已有值永不覆盖（见 `channels.ts` 的 `seedChannel`）。 */
  seedChannelOnce: (versionName: string) => void
  setChannel: (channel: UpdateChannel) => void
  setAutoCheck: (enabled: boolean) => void
  setNotify: (enabled: boolean) => void
  setCheckInterval: (interval: CheckInterval) => void
  markChecked: (at: number) => void
  setCurrentVersion: (version: string) => void
  setVersionUnavailable: (unavailable: boolean) => void
  setIsChecking: (checking: boolean) => void
  setPendingCandidate: (candidate: UpdateCandidate | null) => void
  skipVersion: (version: string) => void
}

export type AppUpdateStore = AppUpdateSettings & AppUpdateSession & AppUpdateActions

const SETTINGS_DEFAULTS: AppUpdateSettings = {
  channel: null,
  autoCheck: true,
  notify: true,
  interval: DEFAULT_CHECK_INTERVAL,
  lastCheckAt: null,
  skippedVersion: null,
}

export const useUpdateStore = create<AppUpdateStore>()(
  persist(
    (set, get) => ({
      ...SETTINGS_DEFAULTS,
      currentVersion: null,
      versionUnavailable: false,
      isChecking: false,
      pendingCandidate: null,

      seedChannelOnce: (versionName) => {
        if (get().channel !== null) return
        set({ channel: seedChannel(null, versionName) })
      },

      setChannel: (channel) => set({ channel }),
      setAutoCheck: (enabled) => set({ autoCheck: enabled }),
      setNotify: (enabled) => set({ notify: enabled }),
      setCheckInterval: (interval) => set({ interval }),
      markChecked: (at) => set({ lastCheckAt: at }),
      setCurrentVersion: (version) => set({ currentVersion: version }),
      setVersionUnavailable: (unavailable) => set({ versionUnavailable: unavailable }),
      setIsChecking: (checking) => set({ isChecking: checking }),
      setPendingCandidate: (candidate) => set({ pendingCandidate: candidate }),
      skipVersion: (version) => set({ skippedVersion: version }),
    }),
    {
      name: UPDATE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        channel: state.channel,
        autoCheck: state.autoCheck,
        notify: state.notify,
        interval: state.interval,
        lastCheckAt: state.lastCheckAt,
        skippedVersion: state.skippedVersion,
      }),
      merge: (persistedState, currentState) => {
        // localStorage 是外部输入：坏值（手改、旧版本、别的应用写的同名键）一律回落到默认，
        // 而不是让一个非法通道值把检查逻辑带进未定义分支。
        const stored = (persistedState ?? {}) as Record<string, unknown>

        return {
          ...currentState,
          channel: normalizeChannel(stored.channel),
          autoCheck: typeof stored.autoCheck === 'boolean' ? stored.autoCheck : currentState.autoCheck,
          notify: typeof stored.notify === 'boolean' ? stored.notify : currentState.notify,
          interval: normalizeCheckInterval(stored.interval) ?? currentState.interval,
          lastCheckAt: typeof stored.lastCheckAt === 'number' ? stored.lastCheckAt : null,
          skippedVersion: typeof stored.skippedVersion === 'string' ? stored.skippedVersion : null,
        }
      },
    }
  )
)
