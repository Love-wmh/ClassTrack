import type { ChangeEvent } from 'react'
import type { Class } from '~/lib/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getBookmarkletAdapterBySchoolId } from '~/lib/bookmarklets'
import { getParserById } from '~/lib/parsers'
import {
  CourseImportError,
  courseImportPlugin,
  getCourseImportErrorCode,
  getCourseImportErrorMessage,
  getNativeCourseImportAdapter,
  isNativeCourseImportAvailable,
} from '~/lib/native-course-import'
import { useClassStore } from '~/store'
import { useDataExportImport } from '~/features/data-management/hooks/useDataExportImport'
import { getCurrentRealWeek } from '~/features/schedule/utils'
import { useStepper } from '~/components/stepper'
import { isValidFirstWeekStartDate } from '~/lib/course-import-shell-protocol'
import { normalizeImportMethod, resolveImportMethodPolicy } from '~/lib/import-methods'
import { isAndroidApp } from '~/lib/native-platform'
import { isNativeWidgetSnapshotAvailable } from '~/lib/native-widget-snapshot'
import { hasSeenWidgetGuide, markWidgetGuideSeen, shouldShowWidgetGuide } from '~/lib/widget-guide'

const backupImportSteps = [
  { id: 'source', label: '来源' },
  { id: 'backup-file', label: '导入数据' },
]

const parserImportSteps = [
  { id: 'source', label: '来源' },
  { id: 'install', label: '安装脚本' },
  { id: 'export', label: '导出 JSON' },
  { id: 'upload', label: '上传 JSON' },
]

const nativeImportSteps = [
  { id: 'source', label: '来源' },
  { id: 'native-webview', label: '应用内导入' },
]

export function useImportFlow() {
  const {
    showImportDialog,
    school,
    selectedSchool,
    selectedImportMethod: storedImportMethod,
    selectedParserId,
    setShowImportDialog,
    setSelectedSchool,
    setSelectedImportMethod,
    setSelectedParserId,
    setSchool,
    importClasses,
    setCurrentWeek,
    setIsInitialized,
    firstWeekStartDate,
    setFirstWeekStartDate,
    semesters,
    currentSemesterId,
    setShowWidgetGuide,
  } = useClassStore()
  const { handleFileSelect } = useDataExportImport()
  const activeSchool = selectedSchool || school
  const nativeImportAdapter = getNativeCourseImportAdapter(activeSchool?.id)
  const nativeImportAvailable = isNativeCourseImportAvailable()
  const androidApp = isAndroidApp()
  // 可选项由策略算，不在这里散落 if：安卓收窄后 parser 那条路整体不在列表里。
  const importMethodPolicy = useMemo(
    () => resolveImportMethodPolicy({ android: androidApp, nativeImportAvailable, hasNativeAdapter: Boolean(nativeImportAdapter) }),
    [androidApp, nativeImportAvailable, nativeImportAdapter]
  )
  // 持久化里可能存着当前环境不允许的方式（安卓上是 parser、换学校后可能变小众档）：渲染前收敛一次，
  // 这样「有效方式」永远等于面板上真正选中的那张卡，不需要靠 effect 去补写 store。
  const selectedImportMethod = normalizeImportMethod(importMethodPolicy, storedImportMethod)
  const isBackupImport = selectedImportMethod === 'backup'
  const isNativeImport = selectedImportMethod === 'native-webview'
  const steps = isBackupImport ? backupImportSteps : isNativeImport ? nativeImportSteps : parserImportSteps
  const stepper = useStepper({ stepCount: steps.length })
  const wasImportDialogOpenRef = useRef(false)
  const parserFileInputRef = useRef<HTMLInputElement>(null)
  const backupFileInputRef = useRef<HTMLInputElement>(null)
  const [parserFile, setParserFile] = useState<File | null>(null)
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [parserFirstWeekStartDate, setParserFirstWeekStartDate] = useState<string | null>(null)
  const [term, setTerm] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [nativeImportStatus, setNativeImportStatus] = useState<'idle' | 'opening' | 'captured' | 'failed'>('idle')
  const [nativeImportError, setNativeImportError] = useState<string | null>(null)

  const handleImportMethodChange = useCallback(
    (method: typeof selectedImportMethod) => {
      setSelectedImportMethod(method)
      const nextStepCount = (method === 'backup' ? backupImportSteps : method === 'native-webview' ? nativeImportSteps : parserImportSteps)
        .length
      stepper.goToStep(Math.min(stepper.currentStep, nextStepCount - 1))
    },
    [setSelectedImportMethod, stepper]
  )
  const currentSemester = semesters.find((semester) => semester.id === currentSemesterId)
  const bookmarkletAdapter = getBookmarkletAdapterBySchoolId(activeSchool?.id)
  /**
   * 导入成功后弹一次加桌引导（**只有安卓原生**，且这台设备还没读过）。
   *
   * 标记在决定要弹的时刻就写下：中途被杀也不会再打扰一次。
   */
  const maybeShowWidgetGuide = useCallback(() => {
    const shouldShow = shouldShowWidgetGuide({
      nativeWidgetAvailable: isNativeWidgetSnapshotAvailable(),
      seen: hasSeenWidgetGuide(),
    })
    if (!shouldShow) return

    markWidgetGuideSeen()
    setShowWidgetGuide(true)
  }, [setShowWidgetGuide])
  const defaultTerm = currentSemester?.code || bookmarkletAdapter?.resolveTerm({ now: new Date() }) || bookmarkletAdapter?.defaultTerm || ''
  const bookmarkletHref = useMemo(() => bookmarkletAdapter?.createScript({ term }) || '', [bookmarkletAdapter, term])
  const canUseBookmarklet = Boolean(bookmarkletAdapter && term)

  useEffect(() => {
    if (!showImportDialog) {
      wasImportDialogOpenRef.current = false
      return
    }

    if (wasImportDialogOpenRef.current) {
      return
    }

    wasImportDialogOpenRef.current = true
    stepper.reset()
    setParserFile(null)
    setBackupFile(null)
    setParserFirstWeekStartDate(firstWeekStartDate)
    setTerm(defaultTerm)
    setIsImporting(false)
    setNativeImportStatus('idle')
    setNativeImportError(null)
    if (!selectedSchool && school) {
      setSelectedSchool(school)
    }
    if (parserFileInputRef.current) {
      parserFileInputRef.current.value = ''
    }
    if (backupFileInputRef.current) {
      backupFileInputRef.current.value = ''
    }
  }, [showImportDialog, school, selectedSchool, firstWeekStartDate, defaultTerm, setSelectedSchool, stepper])

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

  const handleSchoolChange = (nextSchool: typeof selectedSchool) => {
    setSelectedSchool(nextSchool)
    const adapter = getBookmarkletAdapterBySchoolId(nextSchool?.id)
    setTerm(currentSemester?.code || adapter?.resolveTerm({ now: new Date() }) || adapter?.defaultTerm || '')

    // 换学校后当前方式可能不再合法（安卓从天理切到天工，应用内导入就没了）：按**新学校**的策略收敛，
    // 并回到第 1 步 —— 否则会停在一个已经不在列表里的方式的后续步骤上。
    const nextPolicy = resolveImportMethodPolicy({
      android: androidApp,
      nativeImportAvailable,
      hasNativeAdapter: Boolean(getNativeCourseImportAdapter(nextSchool?.id)),
    })
    const nextMethod = normalizeImportMethod(nextPolicy, selectedImportMethod)
    if (nextMethod !== selectedImportMethod) {
      setSelectedImportMethod(nextMethod)
      stepper.goToStep(0)
    }
  }

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

  const handleParserFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setParserFile(event.target.files?.[0] || null)
  }

  const handleBackupFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBackupFile(event.target.files?.[0] || null)
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
      toast.success('已有数据导入成功')
      setShowImportDialog(false)
      // 先给导入结果、再给引导：引导是补充动作，不该盖掉「导入成功」这件事。
      maybeShowWidgetGuide()
    } else {
      toast.error(result.error || '导入失败')
    }
  }

  const handleNativeImport = async () => {
    if (!nativeImportAvailable || !nativeImportAdapter || !term) {
      const message = '当前环境不支持应用内导入，请改用 JSON/书签脚本导入。'
      setNativeImportStatus('failed')
      setNativeImportError(message)
      toast.error(message)
      return
    }

    if (!parserFirstWeekStartDate) {
      const message = '请选择本学期第一周第一天后再导入。'
      setNativeImportStatus('failed')
      setNativeImportError(message)
      toast.error(message)
      return
    }

    const parser = getParserById(nativeImportAdapter.schoolId)
    if (!parser) {
      const message = '未找到天津理工大学课程解析器，请改用 JSON/书签脚本导入。'
      setNativeImportStatus('failed')
      setNativeImportError(message)
      toast.error(message)
      return
    }

    setIsImporting(true)
    setNativeImportStatus('opening')
    setNativeImportError(null)
    try {
      const result = await courseImportPlugin.open({
        adapterId: nativeImportAdapter.adapterId,
        url: nativeImportAdapter.entryUrl,
        term,
        firstWeekStartDate: parserFirstWeekStartDate,
      })
      const importedFirstWeekStartDate =
        result.firstWeekStartDate && isValidFirstWeekStartDate(result.firstWeekStartDate)
          ? result.firstWeekStartDate
          : parserFirstWeekStartDate
      let data: unknown
      try {
        data = JSON.parse(result.data) as unknown
      } catch {
        throw new CourseImportError('PARSE_ERROR', '课表响应不是有效 JSON')
      }
      setNativeImportStatus('captured')
      let classes: Class[]
      try {
        classes = importClasses(data, parser.parse, { firstWeekStartDate: importedFirstWeekStartDate })
      } catch {
        throw new CourseImportError('PARSE_ERROR', '课表响应无法识别')
      }
      if (classes.length === 0) {
        throw new CourseImportError('PARSE_ERROR', '未解析到课程数据')
      }
      setFirstWeekStartDate(importedFirstWeekStartDate)
      setCurrentWeek(getCurrentRealWeek(classes, importedFirstWeekStartDate))
      if (activeSchool) {
        setSchool(activeSchool)
      }
      setIsInitialized(true)
      toast.success(`已成功导入 ${classes.length} 条课程数据`)
      setShowImportDialog(false)
      maybeShowWidgetGuide()
    } catch (error) {
      const message = getCourseImportErrorMessage(error)
      setNativeImportStatus('failed')
      setNativeImportError(message)
      if (getCourseImportErrorCode(error) !== 'CANCELLED') {
        toast.error(message)
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handleParserImport = async () => {
    if (!parserFile || !selectedParserId || !parserFirstWeekStartDate) {
      toast.error('请选择文件、解析器和第一周第一天')
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

      const classes = importClasses(data, parser.parse, { firstWeekStartDate: parserFirstWeekStartDate })
      if (classes.length === 0) {
        throw new Error('未解析到课程数据')
      }
      setFirstWeekStartDate(parserFirstWeekStartDate)
      setCurrentWeek(getCurrentRealWeek(classes, parserFirstWeekStartDate))

      if (activeSchool) {
        setSchool(activeSchool)
      }
      setIsInitialized(true)
      toast.success(`已成功导入 ${classes.length} 条课程数据`)
      setShowImportDialog(false)
      maybeShowWidgetGuide()
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

    if (isNativeImport && stepper.currentStep === 1) {
      await handleNativeImport()
      return
    }

    if (!isBackupImport && !isNativeImport && stepper.currentStep < 3) {
      stepper.goNext()
      return
    }

    if (!isBackupImport && !isNativeImport && stepper.currentStep === 3) {
      await handleParserImport()
      return
    }

    setShowImportDialog(false)
  }

  const primaryLabel = useMemo(() => {
    if (stepper.currentStep === 0) return '下一步'
    if (isBackupImport) return isImporting ? '导入中...' : '导入数据'
    if (isNativeImport && stepper.currentStep === 1) return isImporting ? '导入中...' : '打开教务系统并导入'
    if (stepper.currentStep === 3) return isImporting ? '导入中...' : '导入'
    return '下一步'
  }, [isBackupImport, isImporting, isNativeImport, stepper.currentStep])

  const primaryDisabled =
    isImporting ||
    (stepper.currentStep === 0 && !activeSchool) ||
    (!isBackupImport && !isNativeImport && stepper.currentStep === 1 && !canUseBookmarklet) ||
    (isNativeImport &&
      stepper.currentStep === 1 &&
      (!nativeImportAvailable || !nativeImportAdapter || !term || !parserFirstWeekStartDate)) ||
    (!isBackupImport && !isNativeImport && stepper.currentStep === 3 && (!parserFile || !selectedParserId || !parserFirstWeekStartDate)) ||
    (isBackupImport && stepper.currentStep === 1 && !backupFile)

  return {
    ...stepper,
    steps,
    showImportDialog,
    activeSchool,
    selectedImportMethod,
    selectedParserId,
    parserFile,
    backupFile,
    parserFirstWeekStartDate,
    parserFileInputRef,
    backupFileInputRef,
    bookmarkletAdapter,
    bookmarkletHref,
    term,
    isBackupImport,
    isNativeImport,
    importMethodPolicy,
    nativeImportAdapter,
    nativeImportError,
    nativeImportStatus,
    isImporting,
    primaryLabel,
    primaryDisabled,
    setTerm,
    handleImportMethodChange,
    setSelectedParserId,
    handleParserFirstWeekStartDateChange: setParserFirstWeekStartDate,
    handleOpenChange,
    handleSchoolChange,
    handleCopyBookmarklet,
    handleParserFileChange,
    handleBackupFileChange,
    handlePrimaryAction,
  }
}
