import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Database, FileJson2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { useClassStore } from '~/store'
import type { ImportMethod } from '~/store/slices/uiSlice'
import { schools } from '~/lib/parsers'
import { useDataExportImport } from '~/features/data-management/hooks/useDataExportImport'
import { ImportMethodOption } from './ImportMethodOption'

const importMethods: Array<{
  value: ImportMethod
  title: string
  description: string
  icon: React.ReactNode
}> = [
  {
    value: 'backup',
    title: '导入已有数据',
    description: '用于换设备时恢复从数据管理页面导出的结构化数据。',
    icon: <Database className="size-4" />,
  },
  {
    value: 'parser',
    title: '从课程表解析',
    description: '导入学校课程表 JSON，并通过解析器生成课程数据。',
    icon: <FileJson2 className="size-4" />,
  },
]

export default function SchoolSelectDialog() {
  const {
    showSchoolDialog,
    selectedSchool,
    selectedImportMethod,
    setShowSchoolDialog,
    setSelectedSchool,
    setSelectedImportMethod,
    setSchool,
    setShowImportDialog,
  } = useClassStore()
  const { handleFileSelect } = useDataExportImport()
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [isImportingBackup, setIsImportingBackup] = useState(false)

  const handleSchoolChange = (schoolId: string) => {
    const school = schools.find((s) => s.id === schoolId)
    setSelectedSchool(school || null)
  }

  const handleConfirm = () => {
    if (!selectedSchool) return

    if (selectedImportMethod === 'backup') {
      backupInputRef.current?.click()
      return
    }

    setSchool(selectedSchool)
    setShowSchoolDialog(false)
    setShowImportDialog(true)
  }

  const handleBackupFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImportingBackup(true)
    const result = await handleFileSelect(file)
    setIsImportingBackup(false)
    event.target.value = ''

    if (result.success) {
      setShowSchoolDialog(false)
      toast.success('已有数据导入成功')
    } else {
      toast.error(result.error || '导入失败')
    }
  }

  return (
    <Dialog open={showSchoolDialog} onOpenChange={setShowSchoolDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择学校与导入方式</DialogTitle>
          <DialogDescription>请选择您的学校，并选择要恢复已有数据还是解析新的课程表。</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="school">学校</Label>
            <Select value={selectedSchool?.id} onValueChange={handleSchoolChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择学校" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>导入方式</Label>
            <div className="grid gap-2">
              {importMethods.map((method) => (
                <ImportMethodOption
                  key={method.value}
                  title={method.title}
                  description={method.description}
                  icon={method.icon}
                  selected={selectedImportMethod === method.value}
                  onClick={() => setSelectedImportMethod(method.value)}
                />
              ))}
            </div>
          </div>

          <Input ref={backupInputRef} type="file" accept=".json" className="hidden" onChange={handleBackupFileChange} />
        </div>

        <DialogFooter>
          <Button onClick={handleConfirm} disabled={!selectedSchool || isImportingBackup}>
            {isImportingBackup ? '导入中...' : selectedImportMethod === 'backup' ? '选择已有数据' : '下一步'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
