import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

type OptionCardProps = {
  title: string
  description: string
  icon?: ReactNode
  selected?: boolean
  disabled?: boolean
  onClick: () => void
}

export function OptionCard({ title, description, icon, selected = false, disabled = false, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60',
        selected ? 'border-primary ring-2 ring-primary/10' : 'border-border'
      )}
    >
      {icon && (
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md border',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground'
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
