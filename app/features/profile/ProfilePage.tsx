import DataDisplayButton from '~/components/common/DataDisplayButton'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { DatePicker } from '~/components/ui/date-picker'
import { useClassStore } from '~/store'

export default function ProfilePage() {
  const { school, classes, classMarks, firstWeekStartDate, setFirstWeekStartDate } = useClassStore()

  const totalClasses = classes.length
  const totalAttended = Object.values(classMarks).filter((mark) => mark.isAttended).length
  const totalWithNote = Object.values(classMarks).filter((mark) => mark.note).length

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setFirstWeekStartDate(date.toISOString().split('T')[0])
    } else {
      setFirstWeekStartDate(null)
    }
  }

  return (
    <div className="flex-1 w-full bg-background p-4 md:p-6 overflow-hidden flex flex-col h-full relative">
      <div className="flex flex-1 overflow-hidden max-w-4xl mx-auto w-full relative">
        <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
          <div className="space-y-4">
            <Card id="card-overview">
              <CardHeader>
                <CardTitle>个人信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">学校</div>
                  <DataDisplayButton>{school?.name || '未设置'}</DataDisplayButton>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">已标记课程</div>
                  <DataDisplayButton>
                    {totalAttended} / {totalClasses}
                  </DataDisplayButton>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">有备注课程</div>
                  <DataDisplayButton>{totalWithNote}</DataDisplayButton>
                </div>
              </CardContent>
            </Card>

            <Card id="card-semester">
              <CardHeader>
                <CardTitle>学期设置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">第一周第一天</div>
                  <DatePicker
                    date={firstWeekStartDate ? new Date(firstWeekStartDate) : undefined}
                    onSelect={handleDateSelect}
                    placeholder="选择日期"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
