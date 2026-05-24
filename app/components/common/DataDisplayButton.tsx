import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

type DataDisplayButtonProps = {
  children: ReactNode
  className?: string
}

export default function DataDisplayButton({ children, className }: DataDisplayButtonProps) {
  return (
    <div
      className={cn(
        'border-input dark:bg-input/30 dark:hover:bg-input/50 flex max-w-[var(--global-display-min-width)] items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs h-9',
        className
      )}
    >
      {children}
    </div>
  )
}
