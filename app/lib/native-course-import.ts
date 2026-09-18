import { Capacitor, registerPlugin, WebPlugin } from '@capacitor/core'
import type { NativeCourseImportAdapter } from './types'

export type CourseImportOpenOptions = {
  adapterId: string
  url: string
  term: string
  firstWeekStartDate?: string
}

export type CourseImportResult = {
  data: string
  sourceUrl: string
  term?: string
  firstWeekStartDate?: string
}

export type CourseImportErrorCode =
  | 'UNAVAILABLE'
  | 'CANCELLED'
  | 'INVALID_ADAPTER'
  | 'INVALID_URL'
  | 'NOT_LOGGED_IN_OR_NO_SCHEDULE'
  | 'NETWORK_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'PAYLOAD_READ_FAILED'
  | 'PARSE_ERROR'

export class CourseImportError extends Error {
  readonly code: CourseImportErrorCode

  constructor(code: CourseImportErrorCode, message: string) {
    super(message)
    this.name = 'CourseImportError'
    this.code = code
  }
}

class CourseImportWeb extends WebPlugin {
  async open(): Promise<CourseImportResult> {
    throw new CourseImportError('UNAVAILABLE', '当前环境不支持应用内课表导入，请使用 JSON/书签脚本导入。')
  }
}

export interface CourseImportPlugin {
  open(options: CourseImportOpenOptions): Promise<CourseImportResult>
}

export const courseImportPlugin = registerPlugin<CourseImportPlugin>('CourseImport', {
  web: () => Promise.resolve(new CourseImportWeb()),
})

export const nativeCourseImportAdapters: NativeCourseImportAdapter[] = [
  {
    adapterId: 'tianjin-university-of-technology',
    schoolId: 'tianjin-university-of-technology',
    entryUrl: 'https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do',
    endpointPath: '/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do',
  },
]

export function getNativeCourseImportAdapter(schoolId?: string | null) {
  if (!schoolId) return undefined
  return nativeCourseImportAdapters.find((adapter) => adapter.schoolId === schoolId)
}

export function isNativeCourseImportAvailable() {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('CourseImport')
}

export function getCourseImportErrorCode(error: unknown): CourseImportErrorCode | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  const code = error.code
  if (typeof code !== 'string') return undefined
  const knownCodes: CourseImportErrorCode[] = [
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
  return knownCodes.includes(code as CourseImportErrorCode) ? (code as CourseImportErrorCode) : undefined
}

export function getCourseImportErrorMessage(error: unknown) {
  switch (getCourseImportErrorCode(error)) {
    case 'UNAVAILABLE':
      return '当前环境不支持应用内导入，请使用 JSON/书签脚本导入。'
    case 'CANCELLED':
      return '已取消应用内导入。'
    case 'INVALID_ADAPTER':
      return '应用内导入配置无效，请改用 JSON/书签脚本导入。'
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
      return '应用内导入失败，请进入课表详情页后重试。'
  }
}
