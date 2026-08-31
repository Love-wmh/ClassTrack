import { CardContent } from '~/components/ui/card'
import type { CourseInfo } from '../hooks/useCourseManagement'
import { CourseFieldList } from './CourseFieldList'

type CourseCardContentProps = {
  course: CourseInfo
}

export function CourseCardContent({ course }: CourseCardContentProps) {
  return (
    <CardContent className="p-5">
      <CourseFieldList course={course} />
    </CardContent>
  )
}
