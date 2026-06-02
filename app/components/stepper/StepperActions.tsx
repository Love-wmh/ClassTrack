import { Button } from '~/components/ui/button'

type StepperActionsProps = {
  canGoBack: boolean
  isLastStep: boolean
  primaryLabel?: string
  primaryDisabled?: boolean
  backLabel?: string
  cancelLabel?: string
  onBack: () => void
  onPrimary: () => void
  onCancel?: () => void
}

export function StepperActions({
  canGoBack,
  isLastStep,
  primaryLabel = isLastStep ? '完成' : '下一步',
  primaryDisabled = false,
  backLabel = '上一步',
  cancelLabel = '取消',
  onBack,
  onPrimary,
  onCancel,
}: StepperActionsProps) {
  return (
    <>
      {onCancel && (
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
      {canGoBack && !isLastStep && (
        <Button variant="outline" onClick={onBack}>
          {backLabel}
        </Button>
      )}
      <Button onClick={onPrimary} disabled={primaryDisabled}>
        {primaryLabel}
      </Button>
    </>
  )
}
