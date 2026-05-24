import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, GraduationCap, NotebookPen } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { DatePicker } from '~/components/ui/date-picker'
import { Label } from '~/components/ui/label'
import { useClassStore } from '~/store'
import ProfileStatCard from './ProfileStatCard'
import ProfileTabs, { type ProfileTabItem } from './ProfileTabs'

export default function ProfilePage() {
  const { school, classes, classMarks, currentWeek, firstWeekStartDate, setFirstWeekStartDate } = useClassStore()
  const [activeKey, setActiveKey] = useState('overview')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const overviewCardRef = useRef<HTMLDivElement>(null)
  const semesterCardRef = useRef<HTMLDivElement>(null)
  const dataCardRef = useRef<HTMLDivElement>(null)

  const totalClasses = classes.length
  const totalAttended = Object.values(classMarks).filter((mark) => mark.isAttended).length
  const totalWithNote = Object.values(classMarks).filter((mark) => mark.note).length

  const tabItems: ProfileTabItem[] = useMemo(
    () => [
      { key: 'overview', label: '数据概览' },
      { key: 'semester', label: '学期设置' },
      { key: 'data', label: '课程数据' },
    ],
    []
  )

  const cardRefs = useMemo(
    () => ({
      overview: overviewCardRef,
      semester: semesterCardRef,
      data: dataCardRef,
    }),
    []
  )

  const handleTabChange = useCallback(
    (key: string) => {
      setActiveKey(key)
      const cardRef = cardRefs[key as keyof typeof cardRefs]
      if (cardRef.current && scrollContainerRef.current) {
        const containerTop = scrollContainerRef.current.getBoundingClientRect().top
        const cardTop = cardRef.current.getBoundingClientRect().top
        const offsetTop = cardTop - containerTop + scrollContainerRef.current.scrollTop
        scrollContainerRef.current.scrollTo({
          top: offsetTop,
          behavior: 'smooth',
        })
      }
    },
    [cardRefs]
  )

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setFirstWeekStartDate(date.toISOString().split('T')[0])
    } else {
      setFirstWeekStartDate(null)
    }
  }

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top
      const overviewRect = overviewCardRef.current?.getBoundingClientRect()
      const semesterRect = semesterCardRef.current?.getBoundingClientRect()
      const dataRect = dataCardRef.current?.getBoundingClientRect()
      const containerHeight = container.clientHeight

      if (dataRect && dataRect.top - containerTop < containerHeight / 2) {
        setActiveKey('data')
      } else if (semesterRect && semesterRect.top - containerTop < containerHeight / 2) {
        setActiveKey('semester')
      } else if (overviewRect && overviewRect.top - containerTop < containerHeight / 2) {
        setActiveKey('overview')
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50 px-4 py-6 md:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-6 overflow-hidden">
        <aside className="hidden w-32 shrink-0 md:block">
          <ProfileTabs items={tabItems} activeKey={activeKey} onChange={handleTabChange} />
        </aside>

        <main ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-1">
          <div className="space-y-4 pb-6">
            <Card ref={overviewCardRef} id="profile-overview" className="border-gray-100 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>个人中心</CardTitle>
                    <CardDescription>查看学校信息、课程统计与学期配置</CardDescription>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {school?.name || '未设置学校'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <ProfileStatCard label="学校" value={school?.name || '未设置'} description="当前课程数据所属学校" />
                  <ProfileStatCard
                    label="已标记课程"
                    value={
                      <>
                        {totalAttended}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">/ {totalClasses}</span>
                      </>
                    }
                    description="已完成考勤标记的课程"
                  />
                  <ProfileStatCard label="有备注课程" value={totalWithNote} description="包含备注信息的课程记录" />
                </div>
              </CardContent>
            </Card>

            <Card ref={semesterCardRef} id="profile-semester" className="border-gray-100 shadow-sm">
              <CardHeader>
                <CardTitle>学期设置</CardTitle>
                <CardDescription>设置第一周的开始日期，用于在课程表中推算每天日期</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="first-week-start" className="text-sm font-medium">
                      第一周第一天
                    </Label>
                    <p className="text-sm text-muted-foreground">设置后，课程表会在星期旁显示对应日期</p>
                  </div>
                  <DatePicker
                    date={firstWeekStartDate ? new Date(firstWeekStartDate) : undefined}
                    onSelect={handleDateSelect}
                    placeholder="选择第一周第一天"
                  />
                </div>
              </CardContent>
            </Card>

            <Card ref={dataCardRef} id="profile-data" className="border-gray-100 shadow-sm">
              <CardHeader>
                <CardTitle>课程数据</CardTitle>
                <CardDescription>当前导入课程与学习记录概览</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">课程总数</div>
                      <div className="text-lg font-semibold">{totalClasses}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">当前周次</div>
                      <div className="text-lg font-semibold">第 {currentWeek} 周</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                      <NotebookPen className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">备注数量</div>
                      <div className="text-lg font-semibold">{totalWithNote}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
