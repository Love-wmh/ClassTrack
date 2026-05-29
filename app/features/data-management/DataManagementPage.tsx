import React, { useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import DataDisplayButton from '~/components/common/DataDisplayButton'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { useClassStore } from '~/store'
import { useDataExportImport } from './hooks/useDataExportImport'

export default function DataManagementPage() {
  const { classes, classMarks, currentWeek } = useClassStore()
  const { exportData, handleFileSelect } = useDataExportImport()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const totalClasses = classes.length
  const totalAttended = Object.values(classMarks).filter((mark) => mark.isAttended).length
  const totalWithNote = Object.values(classMarks).filter((mark) => mark.note).length

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const result = await handleFileSelect(file)
    if (result.success) {
      toast.success('数据导入成功')
    } else {
      toast.error(result.error || '导入失败')
    }
    event.target.value = ''
  }

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden bg-background p-5 md:p-6">
      <div className="relative mx-auto flex w-full max-w-4xl flex-1 overflow-hidden">
        <div className="no-scrollbar flex-1 overflow-y-auto pr-2">
          <div className="space-y-4">
            <Card id="card-course-data">
              <CardHeader>
                <CardTitle>课程数据</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">课程总数</div>
                  <DataDisplayButton>{totalClasses}</DataDisplayButton>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">当前周次</div>
                  <DataDisplayButton>第 {currentWeek} 周</DataDisplayButton>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">已标记课程</div>
                  <DataDisplayButton>
                    {totalAttended} / {totalClasses}
                  </DataDisplayButton>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">备注数量</div>
                  <DataDisplayButton>{totalWithNote}</DataDisplayButton>
                </div>
              </CardContent>
            </Card>

            <Card id="card-data-io">
              <CardHeader>
                <CardTitle>数据导入导出</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">导出数据</div>
                  <Button onClick={exportData}>
                    <Download className="mr-1.5 size-4" />
                    导出
                  </Button>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">导入数据</div>
                  <Button onClick={handleImportClick} variant="outline">
                    <Upload className="mr-1.5 size-4" />
                    导入
                  </Button>
                </div>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
