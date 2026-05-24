import type { ComponentProps } from 'react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  cancelText?: string
  confirmText?: string
  confirmVariant?: ComponentProps<typeof Button>['variant']
}

export default function ConfirmDialog({
  open,
  title,
  description,
  onOpenChange,
  onConfirm,
  cancelText = '取消',
  confirmText = '确认',
  confirmVariant = 'default',
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
