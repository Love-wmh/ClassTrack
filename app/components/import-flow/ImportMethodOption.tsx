import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

type ImportMethodOptionProps = {
  title: string
  description: string
  icon: ReactNode
  selected: boolean
  onClick: () => void
}

export function ImportMethodOption({ title, description, icon, selected, onClick }: ImportMethodOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/60',
        selected ? 'border-primary ring-2 ring-primary/10' : 'border-border'
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md border',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
