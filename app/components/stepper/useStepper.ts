import { useCallback, useMemo, useState } from 'react'

export type StepperStep = {
  id: string
  label: string
}

type UseStepperOptions = {
  initialStep?: number
  stepCount: number
}

type StepState = {
  current: number
  previous: number
}

export function useStepper({ initialStep = 0, stepCount }: UseStepperOptions) {
  const [stepState, setStepState] = useState<StepState>({ current: initialStep, previous: initialStep })

  const maxStep = Math.max(0, stepCount - 1)
  const currentStep = Math.min(stepState.current, maxStep)
  const previousStep = stepState.previous
  const canGoBack = currentStep > 0
  const canGoNext = currentStep < maxStep

  const goToStep = useCallback(
    (step: number) => {
      setStepState((state) => {
        const next = Math.max(0, Math.min(step, maxStep))
        return next === state.current ? state : { current: next, previous: state.current }
      })
    },
    [maxStep]
  )

  const goBack = useCallback(() => {
    setStepState((state) => (state.current === 0 ? state : { current: state.current - 1, previous: state.current }))
  }, [])

  const goNext = useCallback(() => {
    setStepState((state) => (state.current >= maxStep ? state : { current: state.current + 1, previous: state.current }))
  }, [maxStep])

  // 与改造前的 goToStep(initialStep) 完全等价：先按 maxStep 夹取再落库。
  const reset = useCallback(() => {
    setStepState((state) => {
      const next = Math.max(0, Math.min(initialStep, maxStep))
      return next === state.current ? state : { current: next, previous: state.current }
    })
  }, [initialStep, maxStep])

  const state = useMemo(
    () => ({
      currentStep,
      previousStep,
      canGoBack,
      canGoNext,
      isFirstStep: currentStep === 0,
      isLastStep: currentStep === maxStep,
    }),
    [canGoBack, canGoNext, currentStep, maxStep, previousStep]
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
