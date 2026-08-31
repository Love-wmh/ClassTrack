import type { Class, School, AppData, ClassMark, Semester } from '~/lib/types'
import type { StoreSlice } from '../types'
import { createSemester as createSemesterModel, ensureUniqueSemesterId, inferSemesterCode, formatSemesterName } from '../migrations'
import { createPastClassMarks, getMarkKey } from '../utils'

export type CreateSemesterInput = {
  name: string
  code?: string
  firstWeekStartDate?: string | null
}

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
  importClasses: (data: unknown, parser: (data: unknown) => Class[], options?: { firstWeekStartDate?: string | null }) => Class[]
  setFirstWeekStartDate: (date: string | null) => void
  createSemester: (input: CreateSemesterInput) => Semester
  deleteSemester: (semesterId: string) => void
  setCurrentSemester: (semesterId: string) => void
}

export const createDataSlice: StoreSlice<DataSlice> = (set, get) => ({
  school: null,
  classes: [],
  classMarks: {},
  currentWeek: 1,
  isInitialized: false,
  firstWeekStartDate: null,
  semesters: [],
  currentSemesterId: null,
  schemaVersion: 2,

  setSchool: (school) => {
    set((state) => {
      state.school = school
      const semester = getCurrentSemester(state)
      if (semester) {
        semester.schoolId = school?.id
        semester.updatedAt = new Date().toISOString()
      }
    })
  },

  setClasses: (classes) => {
    set((state) => {
      state.classes = classes
      syncCurrentSemester(state, { classes })
    })
  },

  setClassMarks: (marks) => {
    set((state) => {
      state.classMarks = marks
      syncCurrentSemester(state, { classMarks: marks })
    })
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
      syncCurrentSemester(state, { classMarks: state.classMarks })
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
      syncCurrentSemester(state, { classMarks: state.classMarks })
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
      syncCurrentSemester(state, { classMarks: state.classMarks })
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
      syncCurrentSemester(state, { classMarks: state.classMarks })
    })
  },

  setCurrentWeek: (week) => {
    set((state) => {
      state.currentWeek = week
      syncCurrentSemester(state, { currentWeek: week })
    })
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
      semesters: [],
      currentSemesterId: null,
      schemaVersion: 2,
    })
  },

  importClasses: (data, parser, options) => {
    const classes = parser(data)
    const { currentWeek, firstWeekStartDate, school } = get()
    const effectiveFirstWeekStartDate = options?.firstWeekStartDate ?? firstWeekStartDate
    const pastClassMarks = createPastClassMarks(classes, effectiveFirstWeekStartDate, currentWeek)
    const importedCode = inferSemesterCode(classes)

    set((state) => {
      const nextMarks = {
        ...pastClassMarks,
        ...state.classMarks,
      }
      const currentSemester = getCurrentSemester(state)
      const shouldCreateSemester =
        !currentSemester ||
        Boolean(currentSemester.classes.length > 0 && importedCode && currentSemester.code && currentSemester.code !== importedCode)

      if (shouldCreateSemester) {
        const semester = ensureUniqueSemesterId(
          createSemesterModel({
            name: formatSemesterName(importedCode) || importedCode || '新导入学期',
            code: importedCode,
            schoolId: school?.id,
            classes,
            classMarks: nextMarks,
            currentWeek,
            firstWeekStartDate: effectiveFirstWeekStartDate,
          }),
          state.semesters
        )

        state.semesters.push(semester)
        state.currentSemesterId = semester.id
        state.classes = semester.classes
        state.classMarks = semester.classMarks
        state.currentWeek = semester.currentWeek
        state.firstWeekStartDate = semester.firstWeekStartDate
        state.isInitialized = true
        return
      }

      state.classes = classes
      state.classMarks = nextMarks
      state.firstWeekStartDate = effectiveFirstWeekStartDate
      state.isInitialized = true
      syncCurrentSemester(state, {
        classes,
        classMarks: nextMarks,
        firstWeekStartDate: effectiveFirstWeekStartDate,
        code: currentSemester?.code || importedCode,
        name: currentSemester?.name || formatSemesterName(importedCode) || importedCode || '当前学期',
        schoolId: school?.id,
      })
    })
    return classes
  },

  setFirstWeekStartDate: (date) => {
    set((state) => {
      state.firstWeekStartDate = date
      syncCurrentSemester(state, { firstWeekStartDate: date })
    })
  },

  createSemester: (input) => {
    const state = get()
    const semester = ensureUniqueSemesterId(
      createSemesterModel({
        name: input.name,
        code: input.code,
        schoolId: state.school?.id,
        firstWeekStartDate: input.firstWeekStartDate ?? null,
      }),
      state.semesters
    )

    set((draft) => {
      draft.semesters.push(semester)
      draft.currentSemesterId = semester.id
      draft.classes = semester.classes
      draft.classMarks = semester.classMarks
      draft.currentWeek = semester.currentWeek
      draft.firstWeekStartDate = semester.firstWeekStartDate
      draft.isInitialized = semester.classes.length > 0
    })

    return semester
  },

  deleteSemester: (semesterId) => {
    set((state) => {
      const deletedIndex = state.semesters.findIndex((semester) => semester.id === semesterId)
      if (deletedIndex === -1) return

      state.semesters.splice(deletedIndex, 1)

      if (state.currentSemesterId !== semesterId) return

      const nextSemester = state.semesters[deletedIndex] || state.semesters[deletedIndex - 1]
      if (!nextSemester) {
        state.currentSemesterId = null
        state.classes = []
        state.classMarks = {}
        state.currentWeek = 1
        state.firstWeekStartDate = null
        state.isInitialized = false
        return
      }

      state.currentSemesterId = nextSemester.id
      state.classes = nextSemester.classes
      state.classMarks = nextSemester.classMarks
      state.currentWeek = nextSemester.currentWeek
      state.firstWeekStartDate = nextSemester.firstWeekStartDate
      state.isInitialized = nextSemester.classes.length > 0
    })
  },

  setCurrentSemester: (semesterId) => {
    set((state) => {
      const semester = state.semesters.find((item) => item.id === semesterId)
      if (!semester) return

      state.currentSemesterId = semester.id
      state.classes = semester.classes
      state.classMarks = semester.classMarks
      state.currentWeek = semester.currentWeek
      state.firstWeekStartDate = semester.firstWeekStartDate
      state.isInitialized = semester.classes.length > 0 || state.isInitialized
    })
  },
})

function getCurrentSemester(state: Pick<DataSlice, 'semesters' | 'currentSemesterId'>) {
  return state.semesters.find((semester) => semester.id === state.currentSemesterId)
}

function syncCurrentSemester(state: DataSlice, patch: Partial<Semester>) {
  const semester = getCurrentSemester(state)
  if (!semester) return

  Object.assign(semester, patch, { updatedAt: new Date().toISOString() })
}
