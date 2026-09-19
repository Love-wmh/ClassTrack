import { useEffect, useRef, useState } from 'react'
import { cn } from '~/lib/utils'
import { CourseImportShell, type CourseImportShellStatus } from './CourseImportShell'
import { defaultCourseImportShellState, isCourseImportShellState, type CourseImportShellState } from '~/lib/course-import-shell-protocol'

function toShellStatus(state: CourseImportShellState): CourseImportShellStatus {
  switch (state.state) {
    case 'ACADEMIC_LOADING':
    case 'CAPTURE_WAITING':
      return 'opening'
    case 'ACADEMIC_READY':
      return 'ready'
    case 'CAPTURED':
      return 'captured'
    case 'HANDING_OFF':
      return 'handing-off'
    case 'ERROR':
    case 'CANCELLED':
      return 'failed'
    case 'IDLE':
    default:
      return 'idle'
  }
}

export default function CourseImportShellEntry() {
  const [nativeState, setNativeState] = useState(defaultCourseImportShellState)
  const [term, setTerm] = useState(defaultCourseImportShellState.term)
  const [firstWeekStartDate, setFirstWeekStartDate] = useState<string | null>(defaultCourseImportShellState.firstWeekStartDate)
  const shellRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handleNativeState = (value: unknown) => {
      if (!isCourseImportShellState(value)) return
      setNativeState(value)
      setTerm((currentTerm) => (currentTerm ? currentTerm : value.term))
      setFirstWeekStartDate((currentDate) => currentDate || value.firstWeekStartDate)
    }

    window.__classTrackNativeState = handleNativeState
    window.CourseImportShell?.ready()

    return () => {
      if (window.__classTrackNativeState === handleNativeState) {
        delete window.__classTrackNativeState
      }
    }
  }, [])

  useEffect(() => {
    const reportSize = () => {
      const element = shellRef.current
      const height = nativeState.contentSlotActive ? element?.scrollHeight : element?.getBoundingClientRect().height
      if (height && Number.isFinite(height)) window.CourseImportShell?.resize(height)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reportSize)
    if (shellRef.current && observer) observer.observe(shellRef.current)
    window.addEventListener('resize', reportSize)
    reportSize()

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', reportSize)
    }
  }, [nativeState.contentSlotActive, nativeState.state])

  const startAcademic = () => {
    window.CourseImportShell?.startAcademic(term, firstWeekStartDate || '')
  }

  const status = toShellStatus(nativeState)
  const error = nativeState.state === 'ERROR' || nativeState.state === 'CANCELLED' ? getShellError(nativeState) : null

  return (
    <section ref={shellRef} className={cn(nativeState.contentSlotActive ? 'min-h-0 overflow-visible' : 'h-full min-h-0 overflow-y-auto')}>
      <CourseImportShell
        variant="native"
        term={term}
        onTermChange={setTerm}
        firstWeekStartDate={firstWeekStartDate}
        onFirstWeekStartDateChange={setFirstWeekStartDate}
        status={status}
        error={error}
        onBack={() => window.CourseImportShell?.back()}
        onRefresh={() => window.CourseImportShell?.refreshAcademic()}
        canRefresh={nativeState.canRefresh}
        onPrimary={
          status === 'idle' ? startAcademic : status === 'failed' ? startAcademic : () => window.CourseImportShell?.requestImport()
        }
        onCancel={() => window.CourseImportShell?.cancel()}
      />
    </section>
  )
}

function getShellError(state: CourseImportShellState) {
  switch (state.errorCode) {
    case 'CANCELLED':
      return '已取消应用内导入。'
    case 'INVALID_ADAPTER':
      return '应用内导入配置无效，请返回后改用 JSON/书签脚本导入。'
    case 'INVALID_URL':
      return '应用内导入网址或跳转不在允许范围内，请返回后重试。'
    case 'NOT_LOGGED_IN_OR_NO_SCHEDULE':
      return '未找到课表响应，请登录并进入课表详情页后刷新重试。'
    case 'NETWORK_ERROR':
      return '教务页面加载失败，请检查网络后重试。'
    case 'PAYLOAD_TOO_LARGE':
    case 'PAYLOAD_READ_FAILED':
      return '课表响应读取失败，请刷新课表页面后重试。'
    case 'PARSE_ERROR':
      return '课表响应无法识别，请确认当前学期后重试。'
    default:
      return '应用内导入失败，请重试或返回选择其他导入方式。'
  }
}
