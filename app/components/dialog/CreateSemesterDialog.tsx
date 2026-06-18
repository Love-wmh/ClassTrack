import { useState } from 'react'
import FirstWeekStartDatePicker from '~/components/common/FirstWeekStartDatePicker'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

type CreateSemesterDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { name: string; code?: string; firstWeekStartDate?: string | null }) => void
  defaultName?: string
  defaultCode?: string
}

export default function CreateSemesterDialog({
  open,
  onOpenChange,
  onCreate,
  defaultName = '',
  defaultCode = '',
}: CreateSemesterDialogProps) {
  const [name, setName] = useState(defaultName)
  const [code, setCode] = useState(defaultCode)
  const [firstWeekStartDate, setFirstWeekStartDate] = useState<string | null>(null)

  const resetForm = () => {
    setName('')
    setCode('')
    setFirstWeekStartDate(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  const handleSubmit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    onCreate({
      name: trimmedName,
      code: code.trim() || undefined,
      firstWeekStartDate,
    })
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建学期</DialogTitle>
          <DialogDescription>创建后会自动切换到这个学期，课程数据可以稍后导入。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="semester-name">学期名称</Label>
            <Input
              id="semester-name"
              value={name}
              placeholder="例如：2025-2026 第二学期"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="semester-code">学期代码</Label>
            <Input id="semester-code" value={code} placeholder="例如：2025-2026-2" onChange={(event) => setCode(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>第一周第一天</Label>
            <FirstWeekStartDatePicker value={firstWeekStartDate} onChange={setFirstWeekStartDate} placeholder="选择日期" showIcon />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!name.trim()} onClick={handleSubmit}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
