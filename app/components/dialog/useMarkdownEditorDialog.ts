import { useClassStore } from '~/store'
import type { MarkdownEditorDialogOptions } from '~/store/slices/uiSlice'

export function useMarkdownEditorDialog() {
  return useClassStore((state) => state.openMarkdownEditorDialog)
}

export type { MarkdownEditorDialogOptions }
