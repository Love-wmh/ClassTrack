import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createDataSlice } from './slices/dataSlice'
import { createUiSlice } from './slices/uiSlice'
import type { ClassStore } from './types'
import { CLASS_TRACK_SCHEMA_VERSION, migrateClassTrackState } from './migrations'

export const useClassStore = create<ClassStore>()(
  persist(
    immer((...args) => ({
      ...createDataSlice(...args),
      ...createUiSlice(...args),
    })),
    {
      name: 'class-track-storage',
      version: CLASS_TRACK_SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => migrateClassTrackState(persistedState),
      partialize: (state) => ({
        school: state.school,
        classes: state.classes,
        classMarks: state.classMarks,
        currentWeek: state.currentWeek,
        isInitialized: state.isInitialized,
        firstWeekStartDate: state.firstWeekStartDate,
        semesters: state.semesters,
        currentSemesterId: state.currentSemesterId,
        courseMetadata: state.courseMetadata,
        schemaVersion: state.schemaVersion,
      }),
    }
  )
)

export type { ClassStore }
