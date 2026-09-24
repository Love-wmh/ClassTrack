import { describe, expect, it } from 'vitest'
import type { Class, Semester } from '~/lib/types'
import {
  createEmptyAppData,
  ensureUniqueSemesterId,
  formatSemesterName,
  inferSemesterCode,
  migrateClassTrackState,
  normalizeImportedData,
} from './migrations'

const createClass = (semester: string): Class => ({
  id: 'class-1',
  name: '高等数学',
  teacher: '张老师',
  classroom: 'A101',
  startTime: '08:00',
  endTime: '09:40',
  dayOfWeek: 1,
  startSection: 1,
  endSection: 2,
  weeks: [1],
  semester,
  courseId: 'MATH',
  classId: '班级1',
  courseType: '必修',
  courseCategory: '专业课',
})

describe('数据迁移', () => {
  it('空数据会创建空应用数据', () => {
    expect(migrateClassTrackState({})).toEqual(createEmptyAppData())
  })

  it('旧扁平结构会生成学期并保留课程投影', () => {
    const classes = [createClass('2025-2026-1')]
    const result = migrateClassTrackState({ classes, currentWeek: 3 })

    expect(result.classes).toEqual(classes)
    expect(result.currentWeek).toBe(3)
    expect(result.semesters).toHaveLength(1)
    expect(result.semesters[0].code).toBe('2025-2026-1')
  })

  it('学期代码取众数并格式化中文名称', () => {
    expect(inferSemesterCode([createClass('A'), createClass('A'), createClass('B')])).toBe('A')
    expect(formatSemesterName('2025-2026-1')).toBe('2025-2026 第一学期')
  })

  it('冲突的学期 ID 会添加递增后缀', () => {
    const semester = { id: 'semester-a', name: '学期', code: 'A' } as Semester
    const existing = [{ id: 'semester-a' }, { id: 'semester-a-2' }] as Semester[]
    expect(ensureUniqueSemesterId(semester, existing).id).toBe('semester-a-3')
  })

  it('非对象导入数据返回空值', () => {
    expect(normalizeImportedData(null)).toBeNull()
    expect(normalizeImportedData('错误数据')).toBeNull()
  })

  it('旧标记补齐「已做出勤判断」，既有统计口径不变', () => {
    const result = migrateClassTrackState({
      classes: [createClass('2025-2026-1')],
      classMarks: { 'class-1-1': { classId: 'class-1', week: 1, isAttended: false, note: '请假' } },
    })

    expect(result.classMarks['class-1-1']).toEqual({
      classId: 'class-1',
      week: 1,
      isAttended: false,
      note: '请假',
      attendanceMarked: true,
    })
  })

  it('显式记为「只写了备注」的标记原样保留', () => {
    const result = migrateClassTrackState({
      classes: [createClass('2025-2026-1')],
      classMarks: { 'class-1-1': { classId: 'class-1', week: 1, isAttended: false, note: '带作业', attendanceMarked: false } },
    })

    expect(result.classMarks['class-1-1'].attendanceMarked).toBe(false)
  })

  it('丢弃非对象的标记条目，并保留原存储键', () => {
    const result = migrateClassTrackState({
      classes: [createClass('2025-2026-1')],
      classMarks: { 'odd-key': null, 'class-1-1': { classId: 'class-1', week: 1, isAttended: true, note: '' } },
    })

    expect(Object.keys(result.classMarks)).toEqual(['class-1-1'])
    expect(result.classMarks['class-1-1'].attendanceMarked).toBe(true)
  })
})
