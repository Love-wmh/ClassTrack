import { Hash, UserRound } from 'lucide-react'
import { CardContent } from '~/components/ui/card'
import type { CourseInfo } from '../hooks/useCourseManagement'
import { CourseDetailItem } from './CourseDetailItem'

type CourseCardContentProps = {
  course: CourseInfo
}

export function CourseCardContent({ course }: CourseCardContentProps) {
  return (
    <CardContent className="p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <CourseDetailItem icon={<UserRound className="size-4" />} label="上课教师" value={course.teacher} />
        <CourseDetailItem icon={<Hash className="size-4" />} label="课程号" value={course.courseId} />
      </div>
    </CardContent>
  )
}
