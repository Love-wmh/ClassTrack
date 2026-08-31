import { PencilLine } from 'lucide-react'
import { Input } from '~/components/ui/input'
import type { CourseField } from '~/lib/types'
import { cn } from '~/lib/utils'
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
      title: `${field.label || '备注'} · Markdown`,
      description: '编辑、导入或导出 Markdown 内容，确认后会回传并保存。',
      value: field.content,
      confirmText: '保存备注',
      onConfirm: (content) => {
        updateCourseField(courseKey, field.id, { content })
      },
    })
  }

  return (
    <div className="min-w-0 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground sm:col-span-2">
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={field.label}
          onChange={(event) => updateCourseField(courseKey, field.id, { label: event.target.value.trim() || '备注' })}
          className="h-7 w-28 border-0 bg-background px-2 text-sm shadow-none focus-visible:ring-1"
          aria-label="备注字段标签"
        />
        <span className="text-xs text-muted-foreground">Markdown</span>
      </div>

      <button
        type="button"
        onClick={handleOpenEditor}
        className={cn(
          'flex min-h-28 w-full items-start justify-between gap-3 rounded-md border border-border/70 bg-background px-3 py-2 text-left text-foreground',
          'transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/35'
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground">点击编辑 Markdown</div>
          <div className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-foreground">{field.content || '未填写'}</div>
        </div>
        <PencilLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  )
}
