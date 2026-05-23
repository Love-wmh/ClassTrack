import React, { useState, useEffect, useMemo } from 'react'
import { useClassStore } from '~/store/classStore'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Class } from '~/lib/types'
import SchoolSelectDialog from '~/components/SchoolSelectDialog'
import ImportDialog from '~/components/ImportDialog'

// 星期几名称
const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 课程颜色映射
const courseColors = [
  'bg-blue-100 border-blue-200 text-blue-800',
  'bg-green-100 border-green-200 text-green-800',
  'bg-yellow-100 border-yellow-200 text-yellow-800',
  'bg-pink-100 border-pink-200 text-pink-800',
  'bg-purple-100 border-purple-200 text-purple-800',
  'bg-cyan-100 border-cyan-200 text-cyan-800',
  'bg-orange-100 border-orange-200 text-orange-800',
  'bg-red-100 border-red-200 text-red-800',
]

// 获取课程颜色
const getCourseColor = (courseId: string) => {
  let hash = 0
  for (let i = 0; i < courseId.length; i++) {
    hash = courseId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return courseColors[Math.abs(hash) % courseColors.length]
}

export default function SchedulePage() {
  const {
    classes,
    classMarks,
    currentWeek,
    isInitialized,
    school,
    setShowSchoolDialog,
    setShowImportDialog,
    toggleAttendance,
    setNote,
    setCurrentWeek,
  } = useClassStore()

  const [editingNote, setEditingNote] = useState<{ id: string; week: number } | null>(null)
  const [noteText, setNoteText] = useState('')

  // 初始化检查
  useEffect(() => {
    if (!isInitialized) {
      if (!school) {
        setShowSchoolDialog(true)
      }
    } else if (classes.length === 0) {
      // 已初始化但没有课程数据，显示导入对话框
      setShowImportDialog(true)
    }
  }, [isInitialized, school, classes.length, setShowSchoolDialog, setShowImportDialog])

  // 获取当前周的课程
  const weekClasses = useMemo(() => {
    return classes.filter((cls) => cls.weeks.includes(currentWeek))
  }, [classes, currentWeek])

  // 获取课程标记
  const getClassMark = (classId: string, week: number) => {
    return classMarks[`${classId}-${week}`]
  }

  // 保存备注
  const handleSaveNote = () => {
    if (editingNote) {
      setNote(editingNote.id, editingNote.week, noteText)
      setEditingNote(null)
      setNoteText('')
    }
  }

  // 计算最大周数
  const maxWeek = useMemo(() => {
    return classes.reduce((max, cls) => {
      const clsMaxWeek = Math.max(...cls.weeks)
      return Math.max(max, clsMaxWeek)
    }, 20)
  }, [classes])

  // 显示欢迎界面或导入界面
  if (!isInitialized || !school || classes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">欢迎使用课程表</h2>
          <p className="text-muted-foreground mb-8">
            {!school ? '请先选择学校' : classes.length === 0 ? '请导入课程表' : '正在加载...'}
          </p>
        </div>
        <SchoolSelectDialog />
        <ImportDialog />
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-50 py-6 px-4 overflow-auto">
      <SchoolSelectDialog />
      <ImportDialog />

      <div className="max-w-7xl mx-auto">
        {/* 顶部标题和周次控制 */}
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-lg shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">课程表</h1>
            {school && <p className="text-sm text-gray-500">{school.name}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}
              disabled={currentWeek <= 1}
              className="h-10 w-10"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <span className="text-lg font-medium text-gray-700 w-20 text-center">
              第 {currentWeek} 周
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeek(Math.min(maxWeek, currentWeek + 1))}
              disabled={currentWeek >= maxWeek}
              className="h-10 w-10"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
        </div>

        {/* 课程表网格 */}
        <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200">
          <table className="w-full border-collapse">
            {/* 表头 */}
            <thead>
              <tr className="bg-gray-50">
                <th className="w-16 p-3 text-center text-sm font-medium text-gray-600 border-b border-r border-gray-200">
                  节
                </th>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <th
                    key={day}
                    className="p-3 text-center text-sm font-medium text-gray-700 border-b border-r border-gray-200 min-w-[120px]"
                  >
                    {dayNames[day]}
                  </th>
                ))}
              </tr>
            </thead>

            {/* 表体 */}
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((section) => (
                <tr key={section} className="hover:bg-gray-50/50">
                  {/* 节次 */}
                  <td className="p-2 text-center text-sm text-gray-600 border-b border-r border-gray-200 bg-gray-50/80">
                    {section}
                  </td>

                  {/* 每天的课程 */}
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                    // 查找在这个位置开始的课程
                    const course = weekClasses.find(
                      (cls) => cls.dayOfWeek === day && cls.startSection === section
                    )

                    // 查找覆盖这个位置的课程（用于判断是否需要渲染空单元格）
                    const coveredCourse = weekClasses.find(
                      (cls) =>
                        cls.dayOfWeek === day &&
                        cls.startSection < section &&
                        cls.endSection >= section
                    )

                    if (coveredCourse && !course) {
                      // 被其他课程覆盖，不渲染
                      return <td key={day} className="border-b border-r border-gray-200" />
                    }

                    if (!course) {
                      // 没有课程，渲染空单元格
                      return (
                        <td
                          key={day}
                          className="p-2 border-b border-r border-gray-200 min-h-[60px]"
                        />
                      )
                    }

                    // 计算课程占几行
                    const rowSpan = course.endSection - course.startSection + 1
                    const mark = getClassMark(course.id, currentWeek)
                    const isAttended = !!mark?.isAttended
                    const note = mark?.note || ''
                    const courseColor = getCourseColor(course.courseId)

                    return (
                      <td
                        key={day}
                        rowSpan={rowSpan}
                        className="p-2 border-b border-r border-gray-200 align-top"
                      >
                        <div
                          className={`w-full p-2 rounded cursor-pointer transition-all shadow-sm outline outline-3 ${
                            isAttended
                              ? `${courseColor} outline-green-500 outline-offset-[-2px]`
                              : `${courseColor} outline-red-500 outline-offset-[-2px]`
                          }`}
                          onClick={() => toggleAttendance(course.id, currentWeek)}
                        >
                          {/* 课程名称 */}
                          <div className="font-medium text-sm mb-1">{course.name}</div>

                          {/* 教室 */}
                          <div className="text-xs text-gray-600 mb-1">{course.classroom}</div>

                          {/* 备注 */}
                          {editingNote?.id === course.id && editingNote?.week === currentWeek ? (
                            <div className="mt-1">
                              <Input
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="添加备注..."
                                className="text-xs h-6 px-2"
                                autoFocus
                                onBlur={handleSaveNote}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.stopPropagation()
                                    handleSaveNote()
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          ) : (
                            <div
                              className="text-xs text-gray-700 mt-1 bg-white/40 rounded px-1 py-0.5 min-h-[18px] cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingNote({ id: course.id, week: currentWeek })
                                setNoteText(note || '')
                              }}
                            >
                              {note || (
                                <span className="text-gray-400 italic text-xs">点击添加备注</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
