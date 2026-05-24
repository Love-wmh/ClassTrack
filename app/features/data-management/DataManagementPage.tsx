import DataDisplayButton from '~/components/common/DataDisplayButton'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { useClassStore } from '~/store'

export default function DataManagementPage() {
  const { classes, classMarks, currentWeek } = useClassStore()

  const totalClasses = classes.length
  const totalAttended = Object.values(classMarks).filter((mark) => mark.isAttended).length
  const totalWithNote = Object.values(classMarks).filter((mark) => mark.note).length

  return (
    <div className="flex-1 w-full bg-background p-4 md:p-6 overflow-hidden flex flex-col h-full relative">
      <div className="flex flex-1 overflow-hidden max-w-4xl mx-auto w-full relative">
        <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
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
          </div>
        </div>
      </div>
    </div>
  )
}
