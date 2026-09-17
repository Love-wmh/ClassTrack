import { describe, expect, it } from 'vitest'
import { generateClassId, parse, parseWeeks } from './parser'

const rawClass = {
  KCM: '高等数学',
  SKJS: '张老师',
  JASMC: 'A101',
  KSSJ: '08:00',
  JSSJ: '09:40',
  SKXQ: 1,
  KSJC: 1,
  JSJC: 2,
  SKZC: '1010',
  XNXQDM: '2025-2026-1',
  KCH: 'MATH',
  JXBID: '班级1',
  KCXZDM_DISPLAY: '必修',
  KCLBDM_DISPLAY: '专业课',
}

describe('天津理工大学解析器', () => {
  it('按二进制周次解析上课周', () => {
    expect(parseWeeks('1010')).toEqual([1, 3])
  })

  it('按教学班、星期和节次生成课程 ID', () => {
    expect(generateClassId(rawClass)).toBe('班级1-1-1')
  })

  it('映射正常课程数据', () => {
    expect(parse({ datas: { cxxszhxqkb: { rows: [rawClass] } } })[0]).toMatchObject({
      id: '班级1-1-1',
      name: '高等数学',
      weeks: [1, 3],
      courseId: 'MATH',
    })
  })

  it('空数据和畸形数据会报告解析失败', () => {
    expect(() => parse({})).toThrow('未解析到课程数据')
    expect(() => parse({ datas: { cxxszhxqkb: { rows: [] } } })).toThrow('未解析到课程数据')
  })
})
