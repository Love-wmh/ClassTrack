import { StepperItem, type StepperItemData } from './StepperItem'

type StepperProps = {
  steps: StepperItemData[]
  currentStep: number
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="rounded-md border bg-muted/20 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        {steps.map((step, index) => (
          <StepperItem key={step.id} step={step} index={index} currentStep={currentStep} isLast={index === steps.length - 1} />
        ))}
      </div>
    </div>
  )
}
