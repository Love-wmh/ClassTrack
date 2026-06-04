import DataDisplayButton from '~/components/common/DataDisplayButton'
import FirstWeekStartDatePicker from '~/components/common/FirstWeekStartDatePicker'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { useClassStore } from '~/store'

export default function ProfilePage() {
  const { school, classes, classMarks, firstWeekStartDate, setFirstWeekStartDate } = useClassStore()

  const totalClasses = classes.length
  const totalAttended = Object.values(classMarks).filter((mark) => mark.isAttended).length
  const totalWithNote = Object.values(classMarks).filter((mark) => mark.note).length

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden bg-background p-5 md:p-6">
      <div className="relative mx-auto flex w-full max-w-4xl flex-1 overflow-hidden">
        <div className="no-scrollbar flex-1 overflow-y-auto pr-2">
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
                  <FirstWeekStartDatePicker value={firstWeekStartDate} onChange={setFirstWeekStartDate} placeholder="选择日期" showIcon />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
