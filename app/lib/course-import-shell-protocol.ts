import type { CourseImportErrorCode } from './native-course-import'

export type CourseImportShellStateName =
  | 'IDLE'
  | 'ACADEMIC_LOADING'
  | 'ACADEMIC_READY'
  | 'CAPTURE_WAITING'
  | 'CAPTURED'
  | 'HANDING_OFF'
  | 'ERROR'
  | 'CANCELLED'

export type CourseImportShellState = {
  state: CourseImportShellStateName
  messageKey: string
  errorCode: CourseImportErrorCode | null
  term: string
  firstWeekStartDate: string | null
  canRetry: boolean
  canRefresh: boolean
  canImport: boolean
  contentSlotActive: boolean
}

export type CourseImportShellBridge = {
  ready: () => void
  resize: (heightCssPx: number) => void
  startAcademic: (term: string, firstWeekStartDate: string) => void
  retry: () => void
  refreshAcademic: () => void
  back: () => void
  requestImport: () => void
  cancel: () => void
}

export const defaultCourseImportShellState: CourseImportShellState = {
  state: 'IDLE',
  messageKey: 'idle',
  errorCode: null,
  term: '',
  firstWeekStartDate: null,
  canRetry: false,
  canRefresh: false,
  canImport: false,
  contentSlotActive: false,
}

const TERM_PATTERN = /^\d{4}-\d{4}-[12]$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const COURSE_IMPORT_ERROR_CODES: CourseImportErrorCode[] = [
  'UNAVAILABLE',
  'CANCELLED',
  'INVALID_ADAPTER',
  'INVALID_URL',
  'NOT_LOGGED_IN_OR_NO_SCHEDULE',
  'NETWORK_ERROR',
  'PAYLOAD_TOO_LARGE',
  'PAYLOAD_READ_FAILED',
  'PARSE_ERROR',
]
const SHELL_STATE_KEYS = new Set([
  'state',
  'messageKey',
  'errorCode',
  'term',
  'firstWeekStartDate',
  'canRetry',
  'canRefresh',
  'canImport',
  'contentSlotActive',
])
const SHELL_STATES: CourseImportShellStateName[] = [
  'IDLE',
  'ACADEMIC_LOADING',
  'ACADEMIC_READY',
  'CAPTURE_WAITING',
  'CAPTURED',
  'HANDING_OFF',
  'ERROR',
  'CANCELLED',
]

export function isValidCourseImportTerm(term: string) {
  return TERM_PATTERN.test(term)
}

export function isValidFirstWeekStartDate(date: string) {
  return DATE_PATTERN.test(date)
}

export function isCourseImportShellState(value: unknown): value is CourseImportShellState {
  if (!value || typeof value !== 'object') return false

  const state = value as Partial<CourseImportShellState>
  const keysAreSafe = Object.keys(state).every((key) => SHELL_STATE_KEYS.has(key))
  const hasValidErrorCode =
    state.errorCode === null ||
    (typeof state.errorCode === 'string' && COURSE_IMPORT_ERROR_CODES.includes(state.errorCode as CourseImportErrorCode))
  const hasValidTerm = typeof state.term === 'string' && (state.term === '' || TERM_PATTERN.test(state.term))
  const hasValidDate =
    state.firstWeekStartDate === null || (typeof state.firstWeekStartDate === 'string' && DATE_PATTERN.test(state.firstWeekStartDate))
  return (
    keysAreSafe &&
    typeof state.state === 'string' &&
    SHELL_STATES.includes(state.state as CourseImportShellStateName) &&
    typeof state.messageKey === 'string' &&
    hasValidErrorCode &&
    hasValidTerm &&
    hasValidDate &&
    typeof state.canRetry === 'boolean' &&
    typeof state.canRefresh === 'boolean' &&
    typeof state.canImport === 'boolean' &&
    typeof state.contentSlotActive === 'boolean'
  )
}

declare global {
  interface Window {
    CourseImportShell?: CourseImportShellBridge
    __classTrackNativeState?: (state: unknown) => void
  }
}

export {}
