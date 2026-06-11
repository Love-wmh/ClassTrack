import { useState } from 'react'
import { Card } from '~/components/ui/card'
import { Collapsible, CollapsibleContent } from '~/components/ui/collapsible'
import type { CourseInfo } from '../hooks/useCourseManagement'
import { CourseCardContent } from './CourseCardContent'
import { CourseCardHeader } from './CourseCardHeader'

type CourseCardProps = {
  course: CourseInfo
}

export function CourseCard({ course }: CourseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} asChild>
      <Card className="overflow-hidden">
        <CourseCardHeader course={course} isExpanded={isExpanded} />
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <CourseCardContent course={course} />
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
