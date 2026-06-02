import type { ReactNode } from 'react'
import { StepperCircle } from './StepperCircle'
import { StepperConnector } from './StepperConnector'

export type StepperItemData = {
  id: string
  label: string
  icon?: ReactNode
}

type StepperItemProps = {
  step: StepperItemData
  index: number
  currentStep: number
  previousStep: number
  isLast: boolean
}

export function StepperItem({ step, index, currentStep, previousStep, isLast }: StepperItemProps) {
  const active = index === currentStep
  const completed = index < currentStep
  const hasStepChanged = currentStep !== previousStep
  const movingForward = currentStep > previousStep
  const animatingConnector = hasStepChanged && (movingForward ? index === previousStep : index === currentStep)

  return (
    <div className="relative flex flex-1 flex-col items-center gap-2 text-center">
      {!isLast && <StepperConnector completed={completed} active={animatingConnector} direction={movingForward ? 'forward' : 'backward'} />}
      <StepperCircle index={index} active={active} completed={completed} icon={step.icon} />
      <div className={active ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground'}>{step.label}</div>
    </div>
  )
}
