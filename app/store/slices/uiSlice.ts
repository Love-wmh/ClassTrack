import type { School } from '~/lib/types'
import type { StoreSlice } from '../types'

export interface UiSlice {
  showSchoolDialog: boolean
  showImportDialog: boolean
  selectedSchool: School | null
  selectedParserId: string | null
  setShowSchoolDialog: (show: boolean) => void
  setShowImportDialog: (show: boolean) => void
  setSelectedSchool: (school: School | null) => void
  setSelectedParserId: (parserId: string | null) => void
}

export const createUiSlice: StoreSlice<UiSlice> = (set) => ({
  showSchoolDialog: false,
  showImportDialog: false,
  selectedSchool: null,
  selectedParserId: null,

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
})
