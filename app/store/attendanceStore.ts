import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_ATTENDANCE_SETTINGS, normalizeAttendanceSettings } from '~/lib/attendance/settings'
import type { AttendanceSettings } from '~/lib/attendance/settings'

/**
 * 「出勤统计」开关的状态。
 *
 * 为什么独立成一个 store（而不是塞进 `useClassStore`）：它是**设备相关偏好**，
 * 不该跟着备份 JSON 迁移到新设备，也不该牵动 `class-track-storage` 的 schema 版本与迁移逻辑。
 * 与 `mobileNavigationStore` / `updateStore` 同一约定。
 */

export const ATTENDANCE_STORAGE_KEY = 'class-track-attendance'

export type { AttendanceSettings }

export type AttendanceStore = AttendanceSettings & {
  setAttendanceEnabled: (enabled: boolean) => void
}

export const useAttendanceStore = create<AttendanceStore>()(
  persist(
    (set) => ({
      ...DEFAULT_ATTENDANCE_SETTINGS,
      setAttendanceEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: ATTENDANCE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ enabled: state.enabled }),
      merge: (persistedState, currentState) => ({
        // localStorage 是外部输入：坏值一律回落到当前默认值（关闭），收窄规则在
        // `app/lib/attendance/settings.ts`，并由 `settings.test.ts` 钉住。
        ...currentState,
        ...normalizeAttendanceSettings(persistedState, currentState),
      }),
    }
  )
)
