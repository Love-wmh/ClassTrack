import { Plus } from 'lucide-react'
import { Button } from '~/components/ui/button'

type AddCourseFieldItemProps = {
  onClick: () => void
}

export function AddCourseFieldItem({ onClick }: AddCourseFieldItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="min-h-11 w-full rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      aria-label="新增课程字段"
      title="新增课程字段"
      onClick={onClick}
    >
      <Plus className="size-5" />
    </Button>
  )
}
