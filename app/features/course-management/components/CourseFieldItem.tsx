import { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import type { CourseField } from '~/lib/types'
import { cn } from '~/lib/utils'
import { useCourseFieldEditor } from '../hooks/useCourseFieldEditor'

type CourseFieldItemProps = {
  courseKey: string
  field: CourseField
  autoEdit?: boolean
}

export function CourseFieldItem({ courseKey, field, autoEdit = false }: CourseFieldItemProps) {
  const editor = useCourseFieldEditor({ courseKey, field, autoEdit })
  const labelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editor.isEditing && autoEdit) labelInputRef.current?.focus()
  }, [autoEdit, editor.isEditing])

  return (
    <div
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-2 rounded-md bg-muted px-4 text-sm text-muted-foreground',
        editor.isEditing && 'ring-1 ring-ring/35'
      )}
      onClick={() => !editor.isEditing && editor.startEditing()}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget
        if (editor.isEditing && (!nextFocusedElement || !event.currentTarget.contains(nextFocusedElement))) {
          editor.save()
        }
      }}
    >
      {editor.isEditing ? (
        <>
          <Input
            ref={labelInputRef}
            value={editor.label}
            onChange={(event) => editor.setLabel(event.target.value)}
            className="h-7 min-w-0 w-24 shrink-0 border-0 bg-background px-2 text-sm shadow-none focus-visible:ring-1"
            aria-label="字段标签"
            onKeyDown={(event) => {
              if (event.key === 'Enter') editor.save()
              if (event.key === 'Escape') editor.cancel()
            }}
          />
          <Input
            value={editor.content}
            onChange={(event) => editor.setContent(event.target.value)}
            className="h-7 min-w-0 flex-1 border-0 bg-background px-2 text-sm font-medium text-foreground shadow-none focus-visible:ring-1"
            aria-label="字段内容"
            onKeyDown={(event) => {
              if (event.key === 'Enter') editor.save()
              if (event.key === 'Escape') editor.cancel()
            }}
          />
        </>
      ) : (
        <>
          <span className="shrink-0">{field.label}</span>
          <span className="min-w-0 truncate font-medium text-foreground">{field.content || '未填写'}</span>
        </>
      )}

      {field.canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`删除字段 ${field.label}`}
          title={`删除字段 ${field.label}`}
          onClick={(event) => {
            event.stopPropagation()
            editor.remove()
          }}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  )
}
