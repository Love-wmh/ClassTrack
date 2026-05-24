import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { useClassStore } from '~/store/classStore'
import { DatePicker } from '~/components/ui/date-picker'

export default function ProfilePage() {
  const { school, classes, classMarks, firstWeekStartDate, setFirstWeekStartDate } = useClassStore()

  // 计算统计数据
  const totalClasses = classes.length
  const totalAttended = Object.values(classMarks).filter((m) => m.isAttended).length
  const totalWithNote = Object.values(classMarks).filter((m) => m.note).length

  // 处理日期选择
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setFirstWeekStartDate(date.toISOString().split('T')[0])
    } else {
      setFirstWeekStartDate(null)
    }
  }

  return (
    <div className="h-full bg-gray-50 py-6 px-4 overflow-auto">
      <div className="max-w-4xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">个人中心</h1>
          <p className="text-muted-foreground">管理您的个人信息和课程数据</p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">学校</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{school?.name || '未设置'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                已标记课程
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalAttended}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  / {totalClasses}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                有备注课程
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalWithNote}</div>
            </CardContent>
          </Card>
        </div>

        {/* 日期设置区域 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>学期设置</CardTitle>
            <CardDescription>设置第一周的开始日期</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="first-week-start">第一周第一天</Label>
              <DatePicker
                date={firstWeekStartDate ? new Date(firstWeekStartDate) : undefined}
                onSelect={handleDateSelect}
                placeholder="选择第一周第一天"
              />
              <p className="text-sm text-muted-foreground">
                设置第一周的开始日期后，课程表会在星期几旁边显示对应的日期
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 功能区域 */}
        <Card>
          <CardHeader>
            <CardTitle>功能</CardTitle>
            <CardDescription>即将推出更多功能</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">个人中心功能正在开发中，敬请期待...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
