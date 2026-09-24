import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type ScheduleDisplayStore = {
  showAttendanceStatus: boolean
  showOutOfWeekCourses: boolean
  setShowAttendanceStatus: (value: boolean) => void
  setShowOutOfWeekCourses: (value: boolean) => void
}

export const useScheduleDisplayStore = create<ScheduleDisplayStore>()(
  persist(
    (set) => ({
      showAttendanceStatus: true,
      showOutOfWeekCourses: false,
      setShowAttendanceStatus: (value) => set({ showAttendanceStatus: value }),
      setShowOutOfWeekCourses: (value) => set({ showOutOfWeekCourses: value }),
    }),
    {
      name: 'class-track-schedule-display',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        showAttendanceStatus: state.showAttendanceStatus,
        showOutOfWeekCourses: state.showOutOfWeekCourses,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ScheduleDisplayStore> | undefined
        return {
          ...currentState,
          showAttendanceStatus: persisted?.showAttendanceStatus ?? currentState.showAttendanceStatus,
          showOutOfWeekCourses: persisted?.showOutOfWeekCourses ?? currentState.showOutOfWeekCourses,
        }
      },
    }
  )
)
