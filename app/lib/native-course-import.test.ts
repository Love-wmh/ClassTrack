import { describe, expect, it } from 'vitest'
import {
  CourseImportError,
  getCourseImportErrorMessage,
  getNativeCourseImportAdapter,
  isNativeCourseImportAvailable,
} from './native-course-import'

describe('应用内课表导入适配器', () => {
  it('只为天津理工大学提供原生入口', () => {
    expect(getNativeCourseImportAdapter('tianjin-university-of-technology')?.entryUrl).toBe(
      'https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do'
    )
    expect(getNativeCourseImportAdapter('tianjin-polytechnic-university')).toBeUndefined()
  })

  it('普通 Web 环境不会伪装成支持原生导入', () => {
    expect(isNativeCourseImportAvailable()).toBe(false)
  })

  it('将 bridge 错误转换为可行动提示', () => {
    expect(getCourseImportErrorMessage(new CourseImportError('NOT_LOGGED_IN_OR_NO_SCHEDULE', 'native error'))).toContain('登录')
    expect(getCourseImportErrorMessage(new CourseImportError('CANCELLED', 'cancelled'))).toBe('已取消应用内导入。')
  })
})
