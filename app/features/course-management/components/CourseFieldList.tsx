import { useState } from 'react'
import { useClassStore } from '~/store'
import type { CourseInfo } from '../hooks/useCourseManagement'
import { CourseFieldItem } from './CourseFieldItem'
import { CourseMarkdownField } from './CourseMarkdownField'
import { AddCourseFieldItem } from './AddCourseFieldItem'

type CourseFieldListProps = {
  course: CourseInfo
}

export function CourseFieldList({ course }: CourseFieldListProps) {
  const addCourseField = useClassStore((state) => state.addCourseField)
  const [newFieldId, setNewFieldId] = useState<string | null>(null)

  const noteField = course.fields.find((field) => field.contentType === 'markdown')
  const textFields = course.fields.filter((field) => field.contentType === 'text')

  const handleAddField = () => {
    setNewFieldId(addCourseField(course.key))
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {textFields.map((field) => (
        <CourseFieldItem key={field.id} courseKey={course.key} field={field} autoEdit={field.id === newFieldId} />
      ))}

      {noteField && <CourseMarkdownField key={noteField.id} courseKey={course.key} field={noteField} />}

      <AddCourseFieldItem onClick={handleAddField} />
    </div>
  )
}
