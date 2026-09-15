import { useCallback } from 'react'
import { exportFile } from '~/lib/exportFile'
import { useClassStore } from '~/store'
import type { AppData } from '~/lib/types'
import { normalizeImportedData } from '~/store/migrations'

export function useDataExportImport() {
  const exportData = useCallback(async () => {
    const state = useClassStore.getState()
    const payload: AppData = {
      school: state.school,
      classes: state.classes,
      classMarks: state.classMarks,
      currentWeek: state.currentWeek,
      isInitialized: state.isInitialized,
      firstWeekStartDate: state.firstWeekStartDate,
      semesters: state.semesters,
      currentSemesterId: state.currentSemesterId,
      courseMetadata: state.courseMetadata,
      schemaVersion: state.schemaVersion,
    }

    return exportFile({
      fileName: `classtrack-backup-${new Date().toISOString().split('T')[0]}.json`,
      mimeType: 'application/json',
      data: JSON.stringify(payload, null, 2),
    })
  }, [])

  const handleFileSelect = useCallback((file: File): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string
          const data = normalizeImportedData(JSON.parse(text))

          if (!data) {
            resolve({ success: false, error: '无效的数据格式' })
            return
          }

          if (!Array.isArray(data.classes)) {
            resolve({ success: false, error: '无效的数据格式：缺少课程数据' })
            return
          }

          useClassStore.setState({
            school: data.school,
            classes: data.classes,
            classMarks: data.classMarks,
            currentWeek: data.currentWeek,
            isInitialized: data.isInitialized,
            firstWeekStartDate: data.firstWeekStartDate,
            semesters: data.semesters,
            currentSemesterId: data.currentSemesterId,
            courseMetadata: data.courseMetadata,
            schemaVersion: data.schemaVersion,
          })

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
  }, [])

  return {
    exportData,
    handleFileSelect,
  }
}
