import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useClassStore } from '~/store'
import { exportSubstituteMarkdown, type SubstituteExportFormat } from '../export'
import { formatLessonMarkdown, getLessonsForDates, getTomorrowDate, mergeImportedMarkdown, type SubstituteLesson } from '../utils'

export function useSubstituteManagement() {
  const classes = useClassStore((state) => state.classes)
  const classMarks = useClassStore((state) => state.classMarks)
  const courseMetadata = useClassStore((state) => state.courseMetadata)
  const firstWeekStartDate = useClassStore((state) => state.firstWeekStartDate)
  const [markdown, setMarkdown] = useState('')
  const [previewMarkdown, setPreviewMarkdown] = useState('')
  const [previewNonce, setPreviewNonce] = useState(0)
  const [editorNonce, setEditorNonce] = useState(0)
  const [importedLessons, setImportedLessons] = useState<SubstituteLesson[]>([])
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [exportFormat, setExportFormat] = useState<SubstituteExportFormat>('markdown')
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPreviewMarkdown(markdown)
      setPreviewNonce((value) => value + 1)
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [markdown])

  const importDates = useCallback(
    (dates: Date[]) => {
      const lessons = getLessonsForDates(dates, classes, classMarks, courseMetadata, firstWeekStartDate)
      if (lessons.length === 0) {
        toast.error('所选日期没有可导入的课程')
        return
      }

      const importedMarkdown = formatLessonMarkdown(lessons)
      setMarkdown((current) => mergeImportedMarkdown(current, importedMarkdown))
      setImportedLessons((current) => {
        const next = [...current]
        lessons.forEach((lesson) => {
          if (!next.some((item) => item.dateKey === lesson.dateKey && item.name === lesson.name && item.time === lesson.time)) {
            next.push(lesson)
          }
        })
        return next
      })
      setEditorNonce((value) => value + 1)
      toast.success(`已导入 ${lessons.length} 节课程`)
    },
    [classMarks, classes, courseMetadata, firstWeekStartDate]
  )

  const handleImportTomorrow = useCallback(() => {
    importDates([getTomorrowDate()])
  }, [importDates])

  const handleImportSelectedDates = useCallback(() => {
    if (selectedDates.length === 0) {
      toast.error('请先选择要导入的日期')
      return
    }
    importDates(selectedDates)
  }, [importDates, selectedDates])

  const handleExport = useCallback(async () => {
    if (!markdown.trim()) {
      toast.error('当前没有可导出的内容')
      return
    }

    try {
      setIsExporting(true)
      await exportSubstituteMarkdown(markdown, exportFormat, importedLessons)
      toast.success('已开始下载')
    } catch (error) {
      console.error(error)
      toast.error('导出失败，请稍后重试')
    } finally {
      setIsExporting(false)
    }
  }, [exportFormat, importedLessons, markdown])

  return {
    markdown,
    previewMarkdown,
    previewNonce,
    editorNonce,
    selectedDates,
    exportFormat,
    isExporting,
    selectedDateCount: selectedDates.length,
    setMarkdown,
    setSelectedDates,
    setExportFormat,
    handleImportTomorrow,
    handleImportSelectedDates,
    handleExport,
  }
}
