import type {Class, School, AppData, ClassMark} from '~/lib/types'
import type { StoreSlice } from '../types'

export interface DataSlice extends AppData {
  setSchool: (school: School | null) => void
  setClasses: (classes: Class[]) => void
  setClassMarks: (marks: Record<string, ClassMark>) => void
  toggleAttendance: (classId: string, week: number) => void
  markWeekAsAttended: (classIds: string[], week: number) => void
  markWeekAsUnattended: (classIds: string[], week: number) => void
  setNote: (classId: string, week: number, note: string) => void
  setCurrentWeek: (week: number) => void
  setIsInitialized: (initialized: boolean) => void
  resetData: () => void
  importClasses: (data: unknown, parser: (data: unknown) => Class[]) => void
  setFirstWeekStartDate: (date: string | null) => void
}

const getMarkKey = (classId: string, week: number) => `${classId}-${week}`

export const createDataSlice: StoreSlice<DataSlice> = (set) => ({
  school: null,
  classes: [],
  classMarks: {},
  currentWeek: 1,
  isInitialized: false,
  firstWeekStartDate: null,

  setSchool: (school) => {
    set({ school })
  },

  setClasses: (classes) => {
    set({ classes })
  },

  setClassMarks: (marks) => {
    set({ classMarks: marks })
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

  markWeekAsAttended: (classIds, week) => {
    set((state) => {
      classIds.forEach((classId) => {
        const key = getMarkKey(classId, week)
        if (!state.classMarks[key]) {
          state.classMarks[key] = {
            classId,
            week,
            isAttended: true,
            note: '',
          }
        } else {
          state.classMarks[key].isAttended = true
        }
      })
    })
  },

  markWeekAsUnattended: (classIds, week) => {
    set((state) => {
      classIds.forEach((classId) => {
        const key = getMarkKey(classId, week)
        if (!state.classMarks[key]) {
          state.classMarks[key] = {
            classId,
            week,
            isAttended: false,
            note: '',
          }
        } else {
          state.classMarks[key].isAttended = false
        }
      })
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
})
