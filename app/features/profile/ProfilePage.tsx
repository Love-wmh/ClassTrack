import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DataDisplayButton from '~/components/common/DataDisplayButton'
import SmoothTabs, { type TabItem } from '~/components/common/SmoothTabs'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { DatePicker } from '~/components/ui/date-picker'
import { useClassStore } from '~/store'

export default function ProfilePage() {
  const { school, classes, classMarks, firstWeekStartDate, setFirstWeekStartDate } = useClassStore()
  const [activeKey, setActiveKey] = useState('overview')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const overviewCardRef = useRef<HTMLDivElement>(null)
  const semesterCardRef = useRef<HTMLDivElement>(null)

  const totalClasses = classes.length
  const totalAttended = Object.values(classMarks).filter((mark) => mark.isAttended).length
  const totalWithNote = Object.values(classMarks).filter((mark) => mark.note).length

  const tabItems: TabItem[] = useMemo(
    () => [
      { key: 'overview', label: '个人信息' },
      { key: 'semester', label: '学期设置' },
    ],
    []
  )

  const cardRefs = useMemo(
    () => ({
      overview: overviewCardRef,
      semester: semesterCardRef,
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

      if (overviewRect && semesterRect) {
        const overviewTop = overviewRect.top - containerTop
        const semesterTop = semesterRect.top - containerTop
        const containerHeight = container.clientHeight

        if (semesterTop < containerHeight / 2) {
          setActiveKey('semester')
        } else if (overviewTop < containerHeight / 2) {
          setActiveKey('overview')
        }
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="flex-1 w-full bg-background p-4 md:p-6 overflow-hidden flex flex-col h-full relative">
      <div className="flex flex-1 overflow-hidden max-w-4xl mx-auto w-full relative gap-6">
        <div className="shrink-0 w-34">
          <SmoothTabs items={tabItems} activeKey={activeKey} onChange={handleTabChange} orientation="vertical" />
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-2 no-scrollbar">
          <div className="space-y-4">
            <Card ref={overviewCardRef} id="card-overview">
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

            <Card ref={semesterCardRef} id="card-semester">
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
