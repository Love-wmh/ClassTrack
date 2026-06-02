import { cn } from '~/lib/utils'

type StepperConnectorProps = {
  completed: boolean
  active: boolean
  direction: 'forward' | 'backward'
}

export function StepperConnector({ completed, active, direction }: StepperConnectorProps) {
  return (
    <div className="absolute left-1/2 top-5 h-px w-full overflow-hidden bg-border sm:top-5.5">
      <div className={cn('h-full bg-primary transition-all duration-500 ease-out', completed ? 'w-full' : 'w-0')} />
      {active && (
        <div
          className={cn(
            'absolute inset-y-0 w-1/2 bg-linear-to-r from-transparent via-primary to-transparent opacity-80 animate-stepper-flow',
            direction === 'backward' && 'animate-stepper-flow-reverse'
          )}
        />
      )}
    </div>
  )
}
