import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '~/lib/utils'

type StepperCircleProps = {
  index: number
  active: boolean
  completed: boolean
  icon?: ReactNode
}

export function StepperCircle({ index, active, completed, icon }: StepperCircleProps) {
  return (
    <div
      className={cn(
        'relative z-10 flex size-10 items-center justify-center rounded-md border text-sm font-semibold transition-colors sm:size-11',
        active || completed ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-muted text-muted-foreground'
      )}
    >
      {completed ? <Check className="size-5" /> : icon || index + 1}
    </div>
  )
}
