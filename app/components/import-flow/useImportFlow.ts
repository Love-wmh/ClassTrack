import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getBookmarkletAdapterBySchoolId } from '~/lib/bookmarklets'
import { getParserById } from '~/lib/parsers'
import { useClassStore } from '~/store'
import type { ImportMethod } from '~/store/slices/uiSlice'
import { useDataExportImport } from '~/features/data-management/hooks/useDataExportImport'
import { useStepper } from './useStepper'

export const importFlowSteps = [
  { id: 'source', label: '来源' },
  { id: 'prepare', label: '准备' },
  { id: 'upload', label: '上传' },
  { id: 'done', label: '完成' },
]

export function useImportFlow() {
  const {
    showImportDialog,
    school,
    selectedSchool,
    selectedImportMethod,
    selectedParserId,
    setShowImportDialog,
    setSelectedSchool,
    setSelectedImportMethod,
    setSelectedParserId,
    setSchool,
    importClasses,
    setIsInitialized,
  } = useClassStore()
  const { handleFileSelect } = useDataExportImport()
  const stepper = useStepper({ stepCount: importFlowSteps.length })
  const parserFileInputRef = useRef<HTMLInputElement>(null)
  const backupFileInputRef = useRef<HTMLInputElement>(null)
  const [parserFile, setParserFile] = useState<File | null>(null)
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [term, setTerm] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [completeMessage, setCompleteMessage] = useState({ title: '导入完成', description: '课程数据已经准备好了。' })

  const activeSchool = selectedSchool || school
  const bookmarkletAdapter = getBookmarkletAdapterBySchoolId(activeSchool?.id)
  const bookmarkletHref = useMemo(() => bookmarkletAdapter?.createScript({ term }) || '', [bookmarkletAdapter, term])
  const isBackupImport = selectedImportMethod === 'backup'
  const canUseBookmarklet = Boolean(bookmarkletAdapter && term)

  useEffect(() => {
    if (showImportDialog) {
      stepper.goToStep(0)
      setParserFile(null)
      setBackupFile(null)
      setIsImporting(false)
      setCompleteMessage({ title: '导入完成', description: '课程数据已经准备好了。' })
      if (!selectedSchool && school) {
        setSelectedSchool(school)
      }
      parserFileInputRef.current && (parserFileInputRef.current.value = '')
      backupFileInputRef.current && (backupFileInputRef.current.value = '')
    }
  }, [showImportDialog, school, selectedSchool, setSelectedSchool, stepper])

  useEffect(() => {
    if (showImportDialog) {
      setTerm(bookmarkletAdapter?.defaultTerm || '')
    }
  }, [showImportDialog, bookmarkletAdapter])

  useEffect(() => {
    if (showImportDialog && activeSchool && !selectedParserId) {
      const matchedParser = getParserById(activeSchool.id)
      if (matchedParser) {
        setSelectedParserId(matchedParser.id)
      }
    }
  }, [showImportDialog, activeSchool, selectedParserId, setSelectedParserId])

  useEffect(() => {
    if (activeSchool) {
      const matchedParser = getParserById(activeSchool.id)
      setSelectedParserId(matchedParser?.id || selectedParserId)
    }
  }, [activeSchool, selectedParserId, setSelectedParserId])

  const handleOpenChange = (open: boolean) => {
    setShowImportDialog(open)
  }

  const handleCopyBookmarklet = async () => {
    if (!bookmarkletHref) return

    try {
      await navigator.clipboard.writeText(bookmarkletHref)
      toast.success('书签脚本已复制')
    } catch (error) {
      toast.error('复制失败，请手动拖拽书签按钮')
      console.error(error)
    }
  }

  const handleOpenEducationalSystem = () => {
    if (!bookmarkletAdapter) return
    window.open(bookmarkletAdapter.educationalSystemUrl, '_blank', 'noopener,noreferrer')
    stepper.goNext()
  }

  const handleParserFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setParserFile(event.target.files?.[0] || null)
  }

  const handleBackupFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBackupFile(event.target.files?.[0] || null)
  }

  const finishImport = (title: string, description: string) => {
    setCompleteMessage({ title, description })
    stepper.goToStep(importFlowSteps.length - 1)
  }

  const handleBackupImport = async () => {
    if (!backupFile) {
      toast.error('请选择备份文件')
      return
    }

    setIsImporting(true)
    const result = await handleFileSelect(backupFile)
    setIsImporting(false)

    if (result.success) {
      finishImport('已有数据导入完成', '已恢复学校、课程、考勤标记和当前周次等本地数据。')
      toast.success('已有数据导入成功')
    } else {
      toast.error(result.error || '导入失败')
    }
  }

  const handleParserImport = async () => {
    if (!parserFile || !selectedParserId) {
      toast.error('请选择文件和解析器')
      return
    }

    try {
      setIsImporting(true)
      const text = await parserFile.text()
      const data = JSON.parse(text)
      const parser = getParserById(selectedParserId)

      if (!parser) {
        throw new Error('解析器未找到')
      }

      const classes = importClasses(data, parser.parse)
      if (classes.length === 0) {
        throw new Error('未解析到课程数据')
      }

      if (activeSchool) {
        setSchool(activeSchool)
      }
      setIsInitialized(true)
      finishImport('课程表导入完成', `已成功导入 ${classes.length} 条课程数据，可以开始管理上课记录。`)
      toast.success('课程表导入成功')
    } catch (error) {
      toast.error('文件解析失败，请检查是否选择了正确的解析器')
      console.error(error)
    } finally {
      setIsImporting(false)
    }
  }

  const handlePrimaryAction = async () => {
    if (stepper.currentStep === 0) {
      if (!activeSchool) {
        toast.error('请选择学校')
        return
      }
      setSchool(activeSchool)
      stepper.goNext()
      return
    }

    if (isBackupImport && stepper.currentStep === 1) {
      await handleBackupImport()
      return
    }

    if (!isBackupImport && stepper.currentStep === 1) {
      stepper.goNext()
      return
    }

    if (!isBackupImport && stepper.currentStep === 2) {
      await handleParserImport()
      return
    }

    setShowImportDialog(false)
  }

  const primaryLabel = useMemo(() => {
    if (stepper.currentStep === 0) return '下一步'
    if (stepper.isLastStep) return '完成'
    if (isBackupImport) return isImporting ? '导入中...' : '导入已有数据'
    if (stepper.currentStep === 2) return isImporting ? '导入中...' : '导入'
    return '下一步'
  }, [isBackupImport, isImporting, stepper.currentStep, stepper.isLastStep])

  const primaryDisabled =
    isImporting ||
    (stepper.currentStep === 0 && !activeSchool) ||
    (!isBackupImport && stepper.currentStep === 1 && !canUseBookmarklet) ||
    (!isBackupImport && stepper.currentStep === 2 && (!parserFile || !selectedParserId)) ||
    (isBackupImport && stepper.currentStep === 1 && !backupFile)

  return {
    ...stepper,
    steps: importFlowSteps,
    showImportDialog,
    activeSchool,
    selectedImportMethod,
    selectedParserId,
    parserFile,
    backupFile,
    parserFileInputRef,
    backupFileInputRef,
    bookmarkletAdapter,
    bookmarkletHref,
    term,
    isBackupImport,
    isImporting,
    completeMessage,
    primaryLabel,
    primaryDisabled,
    setTerm,
    setSelectedSchool,
    setSelectedImportMethod,
    setSelectedParserId,
    handleOpenChange,
    handleCopyBookmarklet,
    handleOpenEducationalSystem,
    handleParserFileChange,
    handleBackupFileChange,
    handlePrimaryAction,
  }
}
