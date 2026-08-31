import { useEffect, useRef, useState } from 'react'
import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react'
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { upload, uploadConfig } from '@milkdown/kit/plugin/upload'
import { nord } from '@milkdown/theme-nord'
import { Decoration } from '@milkdown/kit/prose/view'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { useClassStore } from '~/store'

type MarkdownEditorDialogState = ReturnType<typeof useClassStore.getState>['markdownEditorDialog']

export default function MarkdownEditorDialog() {
  const dialog = useClassStore((state) => state.markdownEditorDialog)
  const closeDialog = useClassStore((state) => state.closeMarkdownEditorDialog)

  return (
    <Dialog open={dialog.open} onOpenChange={(open) => !open && closeDialog()}>
      {dialog.open && <MarkdownEditorDialogBody key={dialog.sessionId} dialog={dialog} onClose={closeDialog} />}
    </Dialog>
  )
}

type MarkdownEditorDialogBodyProps = {
  dialog: MarkdownEditorDialogState
  onClose: () => void
}

function MarkdownEditorDialogBody({ dialog, onClose }: MarkdownEditorDialogBodyProps) {
  const [draft, setDraft] = useState(dialog.value)
  const [editorNonce, setEditorNonce] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleConfirm = () => {
    dialog.onConfirm?.(draft)
    onClose()
  }

  const handleExport = () => {
    const blob = new Blob([draft], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'markdown-notes.md'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    setDraft(text)
    setEditorNonce((value) => value + 1)
  }

  return (
    <DialogContent className="max-w-5xl overflow-hidden p-0 sm:max-w-5xl">
      <div className="flex max-h-[85vh] flex-col">
        <DialogHeader className="gap-2 border-b px-6 pb-4 pr-12 pt-6 text-left">
          <DialogTitle>{dialog.title || '编辑 Markdown'}</DialogTitle>
          <DialogDescription>{dialog.description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            className="hidden"
            onChange={async (event) => {
              await handleImport(event.target.files?.[0] ?? null)
              event.target.value = ''
            }}
          />
          <div className="min-h-[50vh] flex-1 overflow-hidden rounded-md border border-border/70 bg-background">
            <MilkdownProvider>
              <MarkdownEditorCanvas
                key={editorNonce}
                initialValue={draft}
                onMarkdownChange={setDraft}
                onImageUpload={async (files) => {
                  console.log('[MarkdownEditorDialog] image upload placeholder', files)
                  return []
                }}
              />
            </MilkdownProvider>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t px-6 py-4 sm:space-x-0">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              导入
            </Button>
            <Button type="button" variant="outline" onClick={handleExport}>
              导出
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="button" onClick={handleConfirm}>
              {dialog.confirmText}
            </Button>
          </div>
        </DialogFooter>
      </div>
    </DialogContent>
  )
}

type MarkdownEditorCanvasProps = {
  initialValue: string
  onMarkdownChange: (markdown: string) => void
  onImageUpload: (files: File[]) => Promise<string[]>
}

function MarkdownEditorCanvas({ initialValue, onMarkdownChange, onImageUpload }: MarkdownEditorCanvasProps) {
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
          ctx.set(defaultValueCtx, initialValue)
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => markdownChangeRef.current(markdown))
          ctx.set(uploadConfig.key, {
            uploader: async (files) => {
              await imageUploadRef.current(Array.from(files))
              return []
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
    []
  )

  return (
    <div className="markdown-editor-shell h-full min-h-[50vh] overflow-auto px-4 py-3 text-foreground">
      <Milkdown />
    </div>
  )
}
