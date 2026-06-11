import { ChevronDown } from 'lucide-react'
import { CardHeader, CardTitle } from '~/components/ui/card'
import { CollapsibleTrigger } from '~/components/ui/collapsible'
import type { CourseInfo } from '../hooks/useCourseManagement'
import { CourseBadge } from './CourseBadge'

type CourseCardHeaderProps = {
  course: CourseInfo
  isExpanded: boolean
}

export function CourseCardHeader({ course, isExpanded }: CourseCardHeaderProps) {
  return (
    <CardHeader className={isExpanded ? 'border-b bg-muted/20' : 'bg-muted/20'}>
      <div className="flex items-center justify-between gap-4">
        <CardTitle className="min-w-0 truncate text-lg">{course.name}</CardTitle>
        <div className="flex shrink-0 items-center gap-3">
          {course.courseTypes.map((type) => (
            <CourseBadge key={type} label={type} />
          ))}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              aria-label={isExpanded ? '收起课程详情' : '展开课程详情'}
            >
              <ChevronDown className={`size-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
        </div>
      </div>
    </CardHeader>
  )
}
