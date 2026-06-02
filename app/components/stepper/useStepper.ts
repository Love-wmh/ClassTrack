import { useCallback, useMemo, useState } from 'react'

export type StepperStep = {
  id: string
  label: string
}

type UseStepperOptions = {
  initialStep?: number
  stepCount: number
}

export function useStepper({ initialStep = 0, stepCount }: UseStepperOptions) {
  const [currentStep, setCurrentStep] = useState(initialStep)

  const canGoBack = currentStep > 0
  const canGoNext = currentStep < stepCount - 1

  const goToStep = useCallback(
    (step: number) => {
      setCurrentStep(Math.max(0, Math.min(step, stepCount - 1)))
    },
    [stepCount]
  )

  const goBack = useCallback(() => {
    setCurrentStep((step) => Math.max(0, step - 1))
  }, [])

  const goNext = useCallback(() => {
    setCurrentStep((step) => Math.min(stepCount - 1, step + 1))
  }, [stepCount])

  const reset = useCallback(() => {
    goToStep(initialStep)
  }, [goToStep, initialStep])

  const state = useMemo(
    () => ({
      currentStep,
      canGoBack,
      canGoNext,
      isFirstStep: currentStep === 0,
      isLastStep: currentStep === stepCount - 1,
    }),
    [canGoBack, canGoNext, currentStep, stepCount]
  )

  return useMemo(
    () => ({
      ...state,
      goToStep,
      goBack,
      goNext,
      reset,
    }),
    [goBack, goNext, goToStep, reset, state]
  )
}
