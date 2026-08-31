import { PencilLine } from 'lucide-react'
import { Button } from '~/components/ui/button'
import type { CourseField } from '~/lib/types'
import { useClassStore } from '~/store'
import { useMarkdownEditorDialog } from '~/components/dialog/useMarkdownEditorDialog'

type CourseMarkdownFieldProps = {
  courseKey: string
  field: CourseField
}

export function CourseMarkdownField({ courseKey, field }: CourseMarkdownFieldProps) {
  const updateCourseField = useClassStore((state) => state.updateCourseField)
  const openMarkdownEditorDialog = useMarkdownEditorDialog()

  const handleOpenEditor = () => {
    openMarkdownEditorDialog({
      title: '编辑备注',
      description: '',
      value: field.content,
      confirmText: '保存',
      onConfirm: (content) => {
        updateCourseField(courseKey, field.id, { content })
      },
    })
  }

  return (
    <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-md bg-muted px-4 text-sm text-muted-foreground">
      <span className="shrink-0">备注</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ml-auto text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        aria-label="编辑备注"
        title="编辑备注"
        onClick={handleOpenEditor}
      >
        <PencilLine />
      </Button>
    </div>
  )
}
