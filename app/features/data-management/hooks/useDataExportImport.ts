import { useCallback } from 'react'
import { useClassStore } from '~/store'
import type { AppData } from '~/lib/types'

export function useDataExportImport() {
  const { setSchool, setClasses, setClassMarks, setCurrentWeek, setIsInitialized, setFirstWeekStartDate } = useClassStore()

  const exportData = useCallback(() => {
    const state = useClassStore.getState()
    const exportData: AppData = {
      school: state.school,
      classes: state.classes,
      classMarks: state.classMarks,
      currentWeek: state.currentWeek,
      isInitialized: state.isInitialized,
      firstWeekStartDate: state.firstWeekStartDate,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `classtrack-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const handleFileSelect = useCallback(
    (file: File): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const text = event.target?.result as string
            const data = JSON.parse(text) as AppData

            if (!data.classes || !Array.isArray(data.classes)) {
              resolve({ success: false, error: '无效的数据格式：缺少课程数据' })
              return
            }

            setSchool(data.school || null)
            setClasses(data.classes)
            setClassMarks(data.classMarks || {})
            setCurrentWeek(data.currentWeek || 1)
            setIsInitialized(data.isInitialized ?? true)
            setFirstWeekStartDate(data.firstWeekStartDate || null)

            resolve({ success: true })
          } catch {
            resolve({ success: false, error: 'JSON 解析失败，请检查文件格式' })
          }
        }
        reader.onerror = () => {
          resolve({ success: false, error: '文件读取失败' })
        }
        reader.readAsText(file)
      })
    },
    [setSchool, setClasses, setClassMarks, setCurrentWeek, setIsInitialized, setFirstWeekStartDate]
  )

  return {
    exportData,
    handleFileSelect,
  }
}
