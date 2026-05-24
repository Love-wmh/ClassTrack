import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Class, ClassMark, School, AppData } from '~/lib/types'

interface ClassStore extends AppData {
  // UI 状态
  showSchoolDialog: boolean
  showImportDialog: boolean
  selectedSchool: School | null
  selectedParserId: string | null

  // Actions
  setShowSchoolDialog: (show: boolean) => void
  setShowImportDialog: (show: boolean) => void
  setSelectedSchool: (school: School | null) => void
  setSelectedParserId: (parserId: string | null) => void
  setSchool: (school: School | null) => void
  setClasses: (classes: Class[]) => void
  toggleAttendance: (classId: string, week: number) => void
  setNote: (classId: string, week: number, note: string) => void
  setCurrentWeek: (week: number) => void
  setIsInitialized: (initialized: boolean) => void
  resetData: () => void
  importClasses: (data: any, parser: (data: any) => Class[]) => void
  setFirstWeekStartDate: (date: string | null) => void
}

// 获取 classMark 的 key
const getMarkKey = (classId: string, week: number) => `${classId}-${week}`

export const useClassStore = create<ClassStore>()(
  persist(
    immer((set) => ({
      // 数据状态
      school: null,
      classes: [],
      classMarks: {},
      currentWeek: 1,
      isInitialized: false,
      firstWeekStartDate: null,

      // UI 状态
      showSchoolDialog: false,
      showImportDialog: false,
      selectedSchool: null,
      selectedParserId: null,

      // Actions
      setShowSchoolDialog: (show) => {
        set({ showSchoolDialog: show })
      },

      setShowImportDialog: (show) => {
        set({ showImportDialog: show })
      },

      setSelectedSchool: (school) => {
        set({ selectedSchool: school })
      },

      setSelectedParserId: (parserId) => {
        set({ selectedParserId: parserId })
      },

      setSchool: (school) => {
        set({ school })
      },

      setClasses: (classes) => {
        set({ classes })
      },

      toggleAttendance: (classId, week) => {
        set((state) => {
          const key = getMarkKey(classId, week)
          if (!state.classMarks[key]) {
            state.classMarks[key] = {
              classId,
              week,
              isAttended: true,
              note: '',
            }
          } else {
            state.classMarks[key].isAttended = !state.classMarks[key].isAttended
          }
        })
      },

      setNote: (classId, week, note) => {
        set((state) => {
          const key = getMarkKey(classId, week)
          if (!state.classMarks[key]) {
            state.classMarks[key] = {
              classId,
              week,
              isAttended: false,
              note,
            }
          } else {
            state.classMarks[key].note = note
          }
        })
      },

      setCurrentWeek: (week) => {
        set({ currentWeek: week })
      },

      setIsInitialized: (initialized) => {
        set({ isInitialized: initialized })
      },

      resetData: () => {
        set({
          school: null,
          classes: [],
          classMarks: {},
          currentWeek: 1,
          isInitialized: false,
          firstWeekStartDate: null,
        })
      },

      importClasses: (data, parser) => {
        const classes = parser(data)
        set({ classes })
      },

      setFirstWeekStartDate: (date) => {
        set({ firstWeekStartDate: date })
      },
    })),
    {
      name: 'class-track-storage',
      storage: createJSONStorage(() => localStorage),
      // 只持久化数据，不持久化UI状态
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
