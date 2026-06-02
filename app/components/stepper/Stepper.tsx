import { useEffect, useRef } from 'react'
import { StepperItem, type StepperItemData } from './StepperItem'

type StepperProps = {
  steps: StepperItemData[]
  currentStep: number
}

export function Stepper({ steps, currentStep }: StepperProps) {
  const previousStepRef = useRef(currentStep)
  const previousStep = previousStepRef.current

  useEffect(() => {
    previousStepRef.current = currentStep
  }, [currentStep])

  return (
    <div className="rounded-md border bg-muted/20 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        {steps.map((step, index) => (
          <StepperItem
            key={step.id}
            step={step}
            index={index}
            currentStep={currentStep}
            previousStep={previousStep}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  )
}
