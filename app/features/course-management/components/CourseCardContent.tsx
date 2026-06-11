import { CalendarDays, GraduationCap, Hash, MapPin, Tag, UserRound } from 'lucide-react'
import { CardContent } from '~/components/ui/card'
import type { CourseInfo } from '../hooks/useCourseManagement'
import { CourseMetaItem } from './CourseMetaItem'
import { CourseScheduleList } from './CourseScheduleList'
import { CourseSummaryItem } from './CourseSummaryItem'

type CourseCardContentProps = {
  course: CourseInfo
}

export function CourseCardContent({ course }: CourseCardContentProps) {
  return (
    <CardContent className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <CourseMetaItem icon={<UserRound className="size-4" />} label="上课教师" value={course.teacher} />
        <CourseMetaItem icon={<MapPin className="size-4" />} label="上课教室" value={course.classrooms.join('、') || '未记录教室'} />
        <CourseMetaItem icon={<CalendarDays className="size-4" />} label="上课周次" value={course.weekRange} />
        <CourseMetaItem icon={<Hash className="size-4" />} label="课程号" value={course.courseId} />
      </div>

      <div className="grid gap-3 rounded-md bg-muted/30 p-3 text-sm sm:grid-cols-3">
        <CourseSummaryItem label="教学班" value={`${course.classIds.length || 1} 个`} />
        <CourseSummaryItem label="排课时段" value={`${course.schedules.length} 个`} />
        <CourseSummaryItem label="总课次" value={`${course.totalSessions} 次`} />
      </div>

      <CourseScheduleList schedules={course.schedules} />

      <div className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <GraduationCap className="size-4" />
        <span>{course.semester}</span>
        <Tag className="ml-2 size-4" />
        <span>{course.classIds.join('、') || '未记录教学班'}</span>
      </div>
    </CardContent>
  )
}
