import { BookOpenCheck, Layers3 } from 'lucide-react'
import { CourseCard } from './components/CourseCard'
import { CourseEmptyState } from './components/CourseEmptyState'
import { useCourseManagement } from './hooks/useCourseManagement'

export default function CourseManagementPage() {
  const { courses, totalCourses, totalCourseInstances, hasCourses } = useCourseManagement()

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden bg-background p-5 md:p-6">
      <div className="no-scrollbar flex-1 overflow-y-auto pr-2">
        <div className="mx-auto w-full max-w-7xl space-y-4">
          <div className="flex flex-col justify-between gap-3 rounded-md border bg-card px-5 py-4 shadow-xs md:flex-row md:items-center">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">课程管理</h1>
              <p className="mt-1 text-sm text-muted-foreground">以卡片形式汇总课程基础信息、上课教师、教室和排课安排。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                <BookOpenCheck className="size-4" />
                <span>{totalCourses} 门课程</span>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                <Layers3 className="size-4" />
                <span>{totalCourseInstances} 个排课实例</span>
              </div>
            </div>
          </div>

          {!hasCourses ? (
            <CourseEmptyState />
          ) : (
            <div className="grid gap-4">
              {courses.map((course) => (
                <CourseCard key={`${course.semesterId || 'none'}-${course.key}`} course={course} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
