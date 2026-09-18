import { describe, expect, it } from 'vitest'
import {
  defaultCourseImportShellState,
  isCourseImportShellState,
  isValidCourseImportTerm,
  isValidFirstWeekStartDate,
} from './course-import-shell-protocol'

describe('应用内导入 shell 协议', () => {
  it('只接受固定的学期和日期格式', () => {
    expect(isValidCourseImportTerm('2025-2026-2')).toBe(true)
    expect(isValidCourseImportTerm('2025-2026-3')).toBe(false)
    expect(isValidCourseImportTerm('https://example.com')).toBe(false)
    expect(isValidFirstWeekStartDate('2025-09-01')).toBe(true)
    expect(isValidFirstWeekStartDate('2025/09/01')).toBe(false)
  })

  it('只接受不包含 URL 或响应正文的安全状态', () => {
    expect(isCourseImportShellState(defaultCourseImportShellState)).toBe(true)
    expect(
      isCourseImportShellState({
        ...defaultCourseImportShellState,
        state: 'ACADEMIC_READY',
        safePath: '/secret?token=value',
      })
    ).toBe(false)
    expect(
      isCourseImportShellState({
        ...defaultCourseImportShellState,
        canImport: 'yes',
      })
    ).toBe(false)
  })
})
