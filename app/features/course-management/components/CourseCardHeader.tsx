import { ChevronDown } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { CardHeader, CardTitle } from '~/components/ui/card'
import { CollapsibleTrigger } from '~/components/ui/collapsible'
import type { CourseInfo } from '../hooks/useCourseManagement'

type CourseCardHeaderProps = {
  course: CourseInfo
  isExpanded: boolean
}

export function CourseCardHeader({ course, isExpanded }: CourseCardHeaderProps) {
  return (
    <CardHeader className={isExpanded ? 'border-b bg-muted/20' : 'bg-muted/20'}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <CardTitle className="truncate text-lg">{course.name}</CardTitle>
          <div className="flex flex-wrap gap-2">
            {course.courseCategories.map((category) => (
              <Badge key={category} variant="secondary">
                {category}
              </Badge>
            ))}
            {course.courseTypes.map((type) => (
              <Badge key={type} variant="outline">
                {type}
              </Badge>
            ))}
          </div>
        </div>
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
    </CardHeader>
  )
}
