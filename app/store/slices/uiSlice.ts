import type { School } from '~/lib/types'
import type { StoreSlice } from '../types'

export type ImportMethod = 'backup' | 'parser' | 'native-webview'

export type MarkdownEditorDialogOptions = {
  title: string
  description?: string
  value: string
  confirmText?: string
  onConfirm: (value: string) => void
}

type MarkdownEditorDialogState = {
  open: boolean
  sessionId: number
  title: string
  description: string
  value: string
  confirmText: string
  onConfirm: ((value: string) => void) | null
}

export interface UiSlice {
  showSchoolDialog: boolean
  showImportDialog: boolean
  selectedSchool: School | null
  selectedParserId: string | null
  selectedImportMethod: ImportMethod
  /** 导入成功后的「把课表放到桌面」一次性引导是否打开（只在安卓原生会出现）。 */
  showWidgetGuide: boolean
  /** 加桌面板（课表页顶栏那个 Sheet）是否打开；引导的「去添加」靠它直达。 */
  widgetPinSheetOpen: boolean
  markdownEditorDialog: MarkdownEditorDialogState
  setShowSchoolDialog: (show: boolean) => void
  setShowImportDialog: (show: boolean) => void
  setSelectedSchool: (school: School | null) => void
  setSelectedParserId: (parserId: string | null) => void
  setSelectedImportMethod: (method: ImportMethod) => void
  setShowWidgetGuide: (show: boolean) => void
  setWidgetPinSheetOpen: (open: boolean) => void
  openMarkdownEditorDialog: (options: MarkdownEditorDialogOptions) => void
  closeMarkdownEditorDialog: () => void
}

export const createUiSlice: StoreSlice<UiSlice> = (set) => ({
  showSchoolDialog: false,
  showImportDialog: false,
  selectedSchool: null,
  selectedParserId: null,
  selectedImportMethod: 'parser',
  showWidgetGuide: false,
  widgetPinSheetOpen: false,
  markdownEditorDialog: {
    open: false,
    sessionId: 0,
    title: '',
    description: '',
    value: '',
    confirmText: '确认',
    onConfirm: null,
  },

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

  setSelectedImportMethod: (method) => {
    set({ selectedImportMethod: method })
  },

  setShowWidgetGuide: (show) => {
    set({ showWidgetGuide: show })
  },

  setWidgetPinSheetOpen: (open) => {
    set({ widgetPinSheetOpen: open })
  },

  openMarkdownEditorDialog: (options) => {
    set({
      markdownEditorDialog: {
        open: true,
        sessionId: Date.now(),
        title: options.title,
        description: options.description || '',
        value: options.value,
        confirmText: options.confirmText || '确认',
        onConfirm: options.onConfirm,
      },
    })
  },

  closeMarkdownEditorDialog: () => {
    set((state) => {
      state.markdownEditorDialog.open = false
      state.markdownEditorDialog.onConfirm = null
    })
  },
})
