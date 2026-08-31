import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react'
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { upload, uploadConfig } from '@milkdown/kit/plugin/upload'
import { nord } from '@milkdown/theme-nord'
import { Fragment } from '@milkdown/kit/prose/model'
import { Decoration } from '@milkdown/kit/prose/view'
import { useEffect, useRef } from 'react'
import { useCourseNoteEditor } from '../hooks/useCourseNoteEditor'
import type { CourseField } from '~/lib/types'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'
import '@milkdown/theme-nord/style.css'

type CourseMarkdownFieldProps = {
  courseKey: string
  field: CourseField
  onLabelChange: (label: string) => void
}

export function CourseMarkdownField({ courseKey, field, onLabelChange }: CourseMarkdownFieldProps) {
  const noteEditor = useCourseNoteEditor(courseKey, field.id, field.content)

  return (
    <div className="min-w-0 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground sm:col-span-2">
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={field.label}
          onChange={(event) => onLabelChange(event.target.value)}
          className="h-7 w-28 border-0 bg-background px-2 text-sm shadow-none focus-visible:ring-1"
          aria-label="备注字段标签"
        />
        <span className="text-xs text-muted-foreground">Markdown</span>
      </div>
      <MilkdownProvider>
        <MarkdownEditor
          courseKey={courseKey}
          fieldId={field.id}
          value={noteEditor.defaultValue}
          onMarkdownChange={noteEditor.onMarkdownChange}
          onImageUpload={noteEditor.onImageUpload}
        />
      </MilkdownProvider>
    </div>
  )
}

type MarkdownEditorProps = {
  courseKey: string
  fieldId: string
  value: string
  onMarkdownChange: (markdown: string) => void
  onImageUpload: (files: File[]) => Promise<string[]>
}

function MarkdownEditor({ courseKey, fieldId, value, onMarkdownChange, onImageUpload }: MarkdownEditorProps) {
  const markdownChangeRef = useRef(onMarkdownChange)
  const imageUploadRef = useRef(onImageUpload)

  useEffect(() => {
    markdownChangeRef.current = onMarkdownChange
    imageUploadRef.current = onImageUpload
  }, [onImageUpload, onMarkdownChange])

  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root)
          ctx.set(defaultValueCtx, value)
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => markdownChangeRef.current(markdown))
          ctx.set(uploadConfig.key, {
            uploader: async (files) => {
              await imageUploadRef.current(Array.from(files))
              return Fragment.empty
            },
            enableHtmlFileUploader: true,
            uploadWidgetFactory: (pos, spec) => {
              const element = document.createElement('span')
              element.textContent = '上传中...'
              return Decoration.widget(pos, element, spec)
            },
          })
        })
        .config(nord)
        .use(commonmark)
        .use(listener)
        .use(upload),
    [courseKey, fieldId]
  )

  return (
    <div
      className={cn(
        'course-markdown-editor min-h-28 overflow-hidden rounded-md border border-border/70 bg-background px-3 py-2 text-foreground',
        'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/35'
      )}
    >
      <Milkdown />
    </div>
  )
}
