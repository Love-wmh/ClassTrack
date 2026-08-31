import { useCallback, useEffect, useRef } from 'react'
import { useClassStore } from '~/store'

export type CourseImageUploader = (files: File[]) => Promise<string[]>

export const placeholderCourseImageUploader: CourseImageUploader = async (files) => {
  console.log('[CourseNoteEditor] image upload placeholder', files)
  return []
}

export function useCourseNoteEditor(courseKey: string, fieldId: string, initialValue: string) {
  const updateCourseField = useClassStore((state) => state.updateCourseField)
  const latestValueRef = useRef(initialValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    latestValueRef.current = initialValue
  }, [initialValue])

  const save = useCallback(
    (markdown: string) => {
      latestValueRef.current = markdown
      if (timerRef.current) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        updateCourseField(courseKey, fieldId, { content: latestValueRef.current })
        timerRef.current = null
      }, 250)
    },
    [courseKey, fieldId, updateCourseField]
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        updateCourseField(courseKey, fieldId, { content: latestValueRef.current })
      }
    }
  }, [courseKey, fieldId, updateCourseField])

  return {
    defaultValue: initialValue,
    onMarkdownChange: save,
    onImageUpload: placeholderCourseImageUploader,
  }
}
