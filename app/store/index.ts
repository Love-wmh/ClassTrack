import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createDataSlice } from './slices/dataSlice'
import { createUiSlice } from './slices/uiSlice'
import type { ClassStore } from './types'

export const useClassStore = create<ClassStore>()(
  persist(
    immer((...args) => ({
      ...createDataSlice(...args),
      ...createUiSlice(...args),
    })),
    {
      name: 'class-track-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        school: state.school,
        classes: state.classes,
        classMarks: state.classMarks,
        currentWeek: state.currentWeek,
        isInitialized: state.isInitialized,
        firstWeekStartDate: state.firstWeekStartDate,
      }),
    }
  )
)

export type { ClassStore }
