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
      title: '备注 · Markdown',
      description: '编辑、导入或导出 Markdown 内容，确认后会回传并保存。',
      value: field.content,
      confirmText: '保存备注',
      onConfirm: (content) => {
        updateCourseField(courseKey, field.id, { content })
      },
    })
  }

  return (
    <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-md bg-muted px-4 text-sm text-muted-foreground sm:col-span-2">
      <span className="shrink-0 font-medium text-foreground">备注</span>
      <span className="rounded-sm bg-background px-2 py-1 text-xs text-muted-foreground">Markdown</span>
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
