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
  /**
   * 第一段加桌引导关闭后那段「去个人中心看看」的一次性引导是否打开。
   *
   * 它还需要加桌面板**不在**打开状态才会真的出现（见 `ProfileGuideDialog`）：点「去添加」时
   * 面板会随即打开，第二段等它关掉再出现，不叠在面板上。
   */
  showProfileGuide: boolean
  markdownEditorDialog: MarkdownEditorDialogState
  setShowSchoolDialog: (show: boolean) => void
  setShowImportDialog: (show: boolean) => void
  setSelectedSchool: (school: School | null) => void
  setSelectedParserId: (parserId: string | null) => void
  setSelectedImportMethod: (method: ImportMethod) => void
  setShowWidgetGuide: (show: boolean) => void
  setWidgetPinSheetOpen: (open: boolean) => void
  setShowProfileGuide: (show: boolean) => void
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
  showProfileGuide: false,
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

  setShowProfileGuide: (show) => {
    set({ showProfileGuide: show })
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
