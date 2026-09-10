import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { cn } from '~/lib/utils'

type MarkdownEditorProps = {
  value: string
  onChange?: (markdown: string) => void
  readonly?: boolean
  placeholder?: string
  className?: string
}

function toLocalImageUrl(file: File): Promise<string> {
  return Promise.resolve(URL.createObjectURL(file))
}

function MarkdownEditorCanvas({ value, onChange, readonly = false, placeholder }: Omit<MarkdownEditorProps, 'className'>) {
  const markdownChangeRef = useRef(onChange)

  useEffect(() => {
    markdownChangeRef.current = onChange
  }, [onChange])

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: value,
      features: {
        [Crepe.Feature.TopBar]: !readonly,
        [Crepe.Feature.BlockEdit]: !readonly,
        [Crepe.Feature.Toolbar]: !readonly,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: placeholder || (readonly ? '' : '输入 / 插入图片、表格、代码块…'),
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: toLocalImageUrl,
          inlineOnUpload: toLocalImageUrl,
          blockOnUpload: toLocalImageUrl,
        },
      },
    })

    if (readonly) {
      crepe.setReadonly(true)
    }

    if (!readonly) {
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          markdownChangeRef.current?.(markdown)
        })
      })
    }

    return crepe
  }, [])

  return <Milkdown />
}

export function MarkdownEditor({ value, onChange, readonly = false, placeholder, className }: MarkdownEditorProps) {
  return (
    <div className={cn('markdown-editor-shell min-h-0 overflow-auto', className)}>
      <MilkdownProvider>
        <MarkdownEditorCanvas value={value} onChange={onChange} readonly={readonly} placeholder={placeholder} />
      </MilkdownProvider>
    </div>
  )
}
