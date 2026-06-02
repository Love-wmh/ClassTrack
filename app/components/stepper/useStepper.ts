import { useCallback, useEffect, useMemo, useState } from 'react'

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

  const maxStep = Math.max(0, stepCount - 1)
  const canGoBack = currentStep > 0
  const canGoNext = currentStep < maxStep

  useEffect(() => {
    setCurrentStep((step) => Math.min(step, maxStep))
  }, [maxStep])

  const goToStep = useCallback(
    (step: number) => {
      setCurrentStep(Math.max(0, Math.min(step, maxStep)))
    },
    [maxStep]
  )

  const goBack = useCallback(() => {
    setCurrentStep((step) => Math.max(0, step - 1))
  }, [])

  const goNext = useCallback(() => {
    setCurrentStep((step) => Math.min(maxStep, step + 1))
  }, [maxStep])

  const reset = useCallback(() => {
    goToStep(initialStep)
  }, [goToStep, initialStep])

  const state = useMemo(
    () => ({
      currentStep,
      canGoBack,
      canGoNext,
      isFirstStep: currentStep === 0,
      isLastStep: currentStep === maxStep,
    }),
    [canGoBack, canGoNext, currentStep, maxStep]
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
