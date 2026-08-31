import { useState } from 'react'
import { useClassStore } from '~/store'
import type { CourseField } from '~/lib/types'

type UseCourseFieldEditorOptions = {
  courseKey: string
  field: CourseField
  autoEdit?: boolean
}

export function useCourseFieldEditor({ courseKey, field, autoEdit = false }: UseCourseFieldEditorOptions) {
  const updateCourseField = useClassStore((state) => state.updateCourseField)
  const deleteCourseField = useClassStore((state) => state.deleteCourseField)
  const [isEditing, setIsEditing] = useState(autoEdit)
  const [label, setLabel] = useState(field.label)
  const [content, setContent] = useState(field.content)

  const startEditing = () => setIsEditing(true)

  const save = () => {
    updateCourseField(courseKey, field.id, {
      label: label.trim() || '新字段',
      content,
    })
    setIsEditing(false)
  }

  const cancel = () => {
    setLabel(field.label)
    setContent(field.content)
    setIsEditing(false)
  }

  const remove = () => {
    deleteCourseField(courseKey, field.id)
    setIsEditing(false)
  }

  return {
    isEditing,
    label,
    content,
    startEditing,
    setLabel,
    setContent,
    save,
    cancel,
    remove,
  }
}
