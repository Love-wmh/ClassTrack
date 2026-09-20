import { describe, expect, it } from 'vitest'
import type { Class } from '~/lib/types'
import { clampZoom, deriveSectionTimes, getDetailLevel, getWeekParityLabel, snapZoomTier } from './utils'

function makeClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'class-1',
    name: '课程',
    teacher: '老师',
    classroom: '教室',
    startTime: '08:00',
    endTime: '09:40',
    dayOfWeek: 1,
    startSection: 1,
    endSection: 2,
    weeks: [1, 2, 3],
    semester: '2025-2026-1',
    courseId: 'COURSE',
    classId: 'CLASS',
    courseType: '必修',
    courseCategory: '专业课',
    ...overrides,
  }
}

describe('deriveSectionTimes', () => {
  it('跨节课程只在首节给出开始时间、末节给出结束时间', () => {
    const times = deriveSectionTimes([makeClass({ startSection: 1, endSection: 2, startTime: '08:00', endTime: '09:40' })])

    expect(times[1]).toEqual({ start: '08:00' })
    expect(times[2]).toEqual({ end: '09:40' })
    expect(times[11]).toBeUndefined()
    expect(times[12]).toBeUndefined()
  })

  it('单节课程同时给出该节的开始与结束时间', () => {
    const times = deriveSectionTimes([makeClass({ startSection: 9, endSection: 9, startTime: '18:30', endTime: '19:45' })])

    expect(times[9]).toEqual({ start: '18:30', end: '19:45' })
  })

  it('同一节次取出现次数最多的候选时间，且与课程顺序无关', () => {
    const first = makeClass({ id: 'a', startSection: 1, endSection: 2, startTime: '08:00' })
    const second = makeClass({ id: 'b', startSection: 1, endSection: 2, startTime: '08:05' })
    const third = makeClass({ id: 'c', startSection: 1, endSection: 2, startTime: '08:00' })

    expect(deriveSectionTimes([first, second, third])[1]).toEqual({ start: '08:00' })
    expect(deriveSectionTimes([third, second, first])[1]).toEqual({ start: '08:00' })
  })

  it('票数相同时取字典序最小的时间，保证结果稳定', () => {
    const first = makeClass({ id: 'a', startSection: 3, endSection: 4, startTime: '10:10' })
    const second = makeClass({ id: 'b', startSection: 3, endSection: 4, startTime: '10:00' })

    expect(deriveSectionTimes([first, second])[3]).toEqual({ start: '10:00' })
    expect(deriveSectionTimes([second, first])[3]).toEqual({ start: '10:00' })
  })

  it('空课程与空时间字符串都不产生节次时间', () => {
    expect(deriveSectionTimes([])).toEqual({})
    expect(deriveSectionTimes([makeClass({ startTime: '', endTime: '' })])).toEqual({})
  })
})

describe('getWeekParityLabel', () => {
  it('全奇数周次为单周，全偶数周次为双周', () => {
    expect(getWeekParityLabel([1, 3, 5])).toBe('单周')
    expect(getWeekParityLabel([2, 4])).toBe('双周')
  })

  it('混合周次与空数组不返回徽标', () => {
    expect(getWeekParityLabel([1, 2, 3])).toBe('')
    expect(getWeekParityLabel([])).toBe('')
  })
})

describe('clampZoom', () => {
  it('把缩放值裁剪到 1x ~ 2x', () => {
    expect(clampZoom(0.5)).toBe(1)
    expect(clampZoom(3)).toBe(2)
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('NaN 退回下界，避免把网格宽度算成 NaN', () => {
    expect(clampZoom(Number.NaN)).toBe(1)
  })
})

describe('snapZoomTier', () => {
  it('吸附到最近的档位', () => {
    expect(snapZoomTier(1.1)).toBe(1)
    expect(snapZoomTier(1.4)).toBe(1.5)
    expect(snapZoomTier(1.8)).toBe(2)
  })

  it('超出区间的值先被裁剪再吸附', () => {
    expect(snapZoomTier(0.2)).toBe(1)
    expect(snapZoomTier(5)).toBe(2)
  })

  it('正好处于两档中间时取较小的一档', () => {
    expect(snapZoomTier(1.25)).toBe(1)
  })
})

describe('getDetailLevel', () => {
  it('按档位给出信息分级', () => {
    expect(getDetailLevel(1)).toBe('compact')
    expect(getDetailLevel(1.5)).toBe('standard')
    expect(getDetailLevel(2)).toBe('full')
  })
})
