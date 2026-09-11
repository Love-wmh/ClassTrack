import { useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { MarkdownEditor } from '~/components/markdown/MarkdownEditor'
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
    <DialogContent className="h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-hidden p-0 sm:h-[90%] sm:max-w-5xl">
      <div className="flex h-full flex-col overflow-hidden">
        <DialogHeader className="gap-2 border-b px-4 pb-3 pr-12 pt-4 text-left sm:px-6 sm:pb-4 sm:pt-6">
          <DialogTitle>{dialog.title || '编辑 Markdown'}</DialogTitle>
          <DialogDescription>{dialog.description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4">
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
          <MarkdownEditor
            key={editorNonce}
            value={draft}
            onChange={setDraft}
            className="flex-1 rounded-md border border-border/70 bg-background"
          />
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 border-t px-3 py-3 sm:flex sm:items-center sm:justify-between sm:px-6 sm:py-4 sm:space-x-0">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              导入
            </Button>
            <Button type="button" variant="outline" onClick={handleExport}>
              导出
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
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
