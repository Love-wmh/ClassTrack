import { cn } from '~/lib/utils'

type StepperConnectorProps = {
  completed: boolean
}

export function StepperConnector({ completed }: StepperConnectorProps) {
  return <div className={cn('absolute left-1/2 top-5 h-px w-full bg-border sm:top-5.5', completed && 'bg-primary')} />
}
