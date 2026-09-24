import { describe, expect, it } from 'vitest'
// 测试文件刻意跨模块引用 schedule feature：下面有一组用例专门用来锁住
// `widget-snapshot.ts` 与 `features/schedule/utils.ts` 的周次语义不出现分叉。
// 生产代码里 `app/lib` 不依赖 `app/features`，这条约束只对被测实现生效。
import { dayNames } from '~/features/schedule/constants'
import { getMaxWeek } from '~/features/schedule/utils'
import type { Class } from '~/lib/types'
import {
  buildWidgetSnapshot,
  getWidgetSnapshotByteLength,
  serializeWidgetSnapshot,
  WIDGET_SNAPSHOT_MAX_BYTES,
  WIDGET_SNAPSHOT_SCHEMA_VERSION,
  WIDGET_MAX_ENTRIES,
} from './widget-snapshot'

/** 第一周第一天，2026-09-07 是周一。所有用例共用同一基准，避免各写一份日期。 */
const FIRST_WEEK_START = '2026-09-07'

/** 20 个教学周，覆盖到 2027-01-24（周日）。 */
const allWeeks = Array.from({ length: 20 }, (_, index) => index + 1)

/**
 * 构造一条课程数据。
 *
 * @param overrides 需要覆盖的字段，`id` 与 `dayOfWeek` 必填。
 * @returns 完整的 `Class` 对象。
 */
function makeClass(overrides: Partial<Class> & Pick<Class, 'id' | 'dayOfWeek'>): Class {
  return {
    name: '课程',
    teacher: '',
    classroom: '',
    startTime: '08:00',
    endTime: '09:40',
    startSection: 1,
    endSection: 2,
    weeks: allWeeks,
    semester: '2026-2027-1',
    courseId: '',
    classId: '',
    courseType: '',
    courseCategory: '',
    ...overrides,
  }
}

/**
 * 用本地时区构造函数取 epoch，保证断言在 UTC 与 UTC+8 下都一致。
 *
 * 测试里绝不能用 `Date.parse('2026-09-21T10:00')` 之类按 UTC 解析的写法。
 *
 * @param year 年。
 * @param month 月（1-12）。
 * @param day 日。
 * @param hour 小时，默认 0。
 * @param minute 分钟，默认 0。
 * @returns epoch 毫秒。
 */
function localEpoch(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime()
}

/**
 * 用本地时区构造时刻。
 *
 * @param year 年。
 * @param month 月（1-12）。
 * @param day 日。
 * @param hour 小时，默认 0。
 * @param minute 分钟，默认 0。
 * @returns 对应的 `Date`。
 */
function localDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute)
}

/** 2026-09-21 是第 3 周的周一。 */
const WEEK3_MONDAY = localDate(2026, 9, 21, 9, 0)
const WEEK3_MONDAY_DATE = '2026-09-21'

describe('buildWidgetSnapshot', () => {
  it('正常上课日：给出当天剩余课程，并把时间解析为本地绝对时刻', () => {
    const math = makeClass({
      id: 'MATH',
      name: '高等数学',
      classroom: 'A101',
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '11:40',
      startSection: 3,
      endSection: 4,
    })
    const physics = makeClass({
      id: 'PHY',
      name: '大学物理',
      classroom: 'B202',
      dayOfWeek: 1,
      startTime: '13:30',
      endTime: '15:10',
      startSection: 5,
      endSection: 6,
    })

    const snapshot = buildWidgetSnapshot({ classes: [physics, math], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, WEEK3_MONDAY)

    expect(snapshot.status).toBe('ok')
    expect(snapshot.schemaVersion).toBe(WIDGET_SNAPSHOT_SCHEMA_VERSION)

    // 当天两节课都还没结束，且按开始时间升序排列（输入刻意乱序）。
    const today = snapshot.entries.filter((entry) => entry.dayOffset === 0)
    expect(today.map((entry) => entry.id)).toEqual([`MATH#${WEEK3_MONDAY_DATE}`, `PHY#${WEEK3_MONDAY_DATE}`])
    expect(today[0]).toMatchObject({
      name: '高等数学',
      classroom: 'A101',
      sections: '3-4',
      startLabel: '10:00',
      endLabel: '11:40',
      dayKey: WEEK3_MONDAY_DATE,
      weekdayLabel: '周一',
      startEpochMs: localEpoch(2026, 9, 21, 10, 0),
      endEpochMs: localEpoch(2026, 9, 21, 11, 40),
    })
  })

  it('进行中的课程仍留在快照里，不会被当成已结束而丢掉', () => {
    const math = makeClass({ id: 'MATH', dayOfWeek: 1, startTime: '10:00', endTime: '11:40' })
    const now = localDate(2026, 9, 21, 10, 30)

    const snapshot = buildWidgetSnapshot({ classes: [math], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, now)

    const inProgress = snapshot.entries.find((entry) => entry.id === `MATH#${WEEK3_MONDAY_DATE}`)
    expect(inProgress).toBeDefined()
    expect(inProgress && inProgress.startEpochMs).toBeLessThan(now.getTime())
    expect(inProgress && inProgress.endEpochMs).toBeGreaterThan(now.getTime())
  })

  it('已结束的课程被丢弃，但当天边界信息仍然保留', () => {
    const math = makeClass({ id: 'MATH', dayOfWeek: 1, startTime: '10:00', endTime: '11:40' })
    const tuesday = makeClass({ id: 'ENG', dayOfWeek: 2, startTime: '08:00', endTime: '09:40', weeks: [3] })
    const now = localDate(2026, 9, 21, 20, 0)

    const snapshot = buildWidgetSnapshot({ classes: [math, tuesday], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, now)

    expect(snapshot.entries.some((entry) => entry.id === `MATH#${WEEK3_MONDAY_DATE}`)).toBe(false)
    // 「今天是哪天」不依赖 entries，因此当天没有剩余课程时 dayEndEpochMs 依旧覆盖今天。
    expect(snapshot.dayEndEpochMs[0]).toBe(localEpoch(2026, 9, 22))
    expect(snapshot.dayEndEpochMs[0]).toBeGreaterThan(now.getTime())
    expect(snapshot.entries[0]).toMatchObject({ dayKey: '2026-09-22', dayOffset: 1 })
  })

  it('休息日：当天没有课程，但后续日期仍然被覆盖', () => {
    const math = makeClass({ id: 'MATH', dayOfWeek: 1, startTime: '10:00', endTime: '11:40', weeks: [2, 3] })
    // 2026-09-19 是第 2 周的周六。
    const saturday = localDate(2026, 9, 19, 9, 0)

    const snapshot = buildWidgetSnapshot({ classes: [math], currentWeek: 2, firstWeekStartDate: FIRST_WEEK_START }, saturday)

    expect(snapshot.status).toBe('ok')
    expect(snapshot.entries.some((entry) => entry.dayOffset === 0)).toBe(false)
    expect(snapshot.entries[0]).toMatchObject({ dayKey: '2026-09-21', dayOffset: 2 })
    expect(snapshot.dayEndEpochMs.length).toBeGreaterThan(2)
  })

  it('weeks 不含当前周的课程不出现', () => {
    const onlyWeek1 = makeClass({ id: 'OLD', dayOfWeek: 1, weeks: [1] })

    const snapshot = buildWidgetSnapshot({ classes: [onlyWeek1], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, WEEK3_MONDAY)

    expect(snapshot.status).toBe('ok')
    expect(snapshot.entries).toEqual([])
  })

  it('跨周边界：周日的下一节周一课属于第 4 周，第 3 周的课不会误报', () => {
    const week3Sunday = makeClass({ id: 'SUN3', dayOfWeek: 7, weeks: [3], startTime: '10:00', endTime: '11:40' })
    const week4Monday = makeClass({ id: 'MON4', dayOfWeek: 1, weeks: [4], startTime: '08:00', endTime: '09:40' })
    const week3MondayOnly = makeClass({ id: 'MON3', dayOfWeek: 1, weeks: [3], startTime: '08:00', endTime: '09:40' })
    // 2026-09-27 是第 3 周周日；当天 20:00 时周日的课已结束。
    const sundayEvening = localDate(2026, 9, 27, 20, 0)

    const snapshot = buildWidgetSnapshot(
      { classes: [week3Sunday, week4Monday, week3MondayOnly], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START },
      sundayEvening
    )

    const ids = snapshot.entries.map((entry) => entry.id)
    expect(ids).toEqual([`MON4#2026-09-28`])
    expect(ids).not.toContain(`MON3#2026-09-28`)
    expect(snapshot.entries[0]).toMatchObject({ dayKey: '2026-09-28', dayOffset: 1, weekdayLabel: '周一' })
  })

  it('firstWeekStartDate 缺失或非法时返回 unavailable，而不是猜一个日期', () => {
    const math = makeClass({ id: 'MATH', dayOfWeek: 1 })

    for (const firstWeekStartDate of [null, '', 'not-a-date', '2026-9-7', '2026-02-30']) {
      const snapshot = buildWidgetSnapshot({ classes: [math], currentWeek: 3, firstWeekStartDate }, WEEK3_MONDAY)

      expect(snapshot.status).toBe('unavailable')
      expect(snapshot.entries).toEqual([])
      expect(snapshot.dayEndEpochMs).toEqual([])
      expect(snapshot.validUntilEpochMs).toBe(snapshot.generatedAtEpochMs)
    }
  })

  it('课表为空时返回 empty', () => {
    const snapshot = buildWidgetSnapshot({ classes: [], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, WEEK3_MONDAY)

    expect(snapshot.status).toBe('empty')
    expect(snapshot.entries).toEqual([])
    expect(snapshot.dayEndEpochMs).toEqual([])
  })

  it('带上「今天」的日期与星期（原生不做日期运算，hero 的日期行只能靠它）', () => {
    const math = makeClass({ id: 'MATH', dayOfWeek: 1 })
    const empty = buildWidgetSnapshot({ classes: [], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, WEEK3_MONDAY)
    const unavailable = buildWidgetSnapshot({ classes: [math], currentWeek: 3, firstWeekStartDate: null }, WEEK3_MONDAY)
    const ok = buildWidgetSnapshot({ classes: [math], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, WEEK3_MONDAY)

    // WEEK3_MONDAY 是 2026-09-21 周一。
    expect(ok.todayDayKey).toBe('2026-09-21')
    expect(ok.todayWeekdayLabel).toBe('周一')

    // 三种 status 都要带上：字段缺失会让「今天没课」的空课态少一行日期。
    for (const snapshot of [ok, empty, unavailable]) {
      expect(snapshot.todayDayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(snapshot.todayWeekdayLabel).toMatch(/^周[一二三四五六日]$/)
    }
  })

  it('dayEndEpochMs 严格递增，且与 entries 的 dayOffset 下标一致', () => {
    const math = makeClass({ id: 'MATH', dayOfWeek: 1, weeks: [3] })
    const physics = makeClass({ id: 'PHY', dayOfWeek: 4, weeks: [4] })

    const snapshot = buildWidgetSnapshot({ classes: [math, physics], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, WEEK3_MONDAY)
    const { dayEndEpochMs, entries, validUntilEpochMs } = snapshot

    // 2026-09-21 到学期末 2027-01-24 共 126 天。
    expect(dayEndEpochMs.length).toBe(126)
    expect(validUntilEpochMs).toBe(localEpoch(2027, 1, 25))

    for (let index = 1; index < dayEndEpochMs.length; index += 1) {
      expect(dayEndEpochMs[index]).toBeGreaterThan(dayEndEpochMs[index - 1])
    }

    for (const entry of entries) {
      expect(entry.dayOffset).toBeLessThan(dayEndEpochMs.length)
      expect(entry.startEpochMs).toBeLessThan(dayEndEpochMs[entry.dayOffset])
      expect(entry.endEpochMs).toBeLessThanOrEqual(dayEndEpochMs[entry.dayOffset])
    }
  })

  it('覆盖窗口延伸到学期最后一周的最后一天，而不是固定天数', () => {
    // 学期第 1 周周一生成 → 覆盖到第 20 周最后一天。
    const snapshotFromWeek1 = buildWidgetSnapshot(
      { classes: [makeClass({ id: 'MATH', dayOfWeek: 1 })], currentWeek: 1, firstWeekStartDate: FIRST_WEEK_START },
      localDate(2026, 9, 7, 8, 0)
    )
    expect(snapshotFromWeek1.dayEndEpochMs.length).toBe(140)

    // 学期第 3 周周一生成 → 窗口自然缩短，不重复覆盖过去。
    expect(
      buildWidgetSnapshot(
        { classes: [makeClass({ id: 'MATH', dayOfWeek: 1 })], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START },
        WEEK3_MONDAY
      ).dayEndEpochMs.length
    ).toBe(126)
  })

  it('长期不打开 App：生成 42 天后仍未过期的快照里能找到对应日期的课', () => {
    const math = makeClass({ id: 'MATH', dayOfWeek: 1, startTime: '10:00', endTime: '11:40' })

    const snapshot = buildWidgetSnapshot({ classes: [math], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, WEEK3_MONDAY)

    // native 侧会用「第一个 dayEndEpochMs > now 的下标」判定今天是第几天。
    const now = localEpoch(2026, 11, 2, 9, 0)
    const currentDayOffset = snapshot.dayEndEpochMs.findIndex((dayEnd) => dayEnd > now)

    expect(currentDayOffset).toBe(42)
    expect(now).toBeLessThan(snapshot.validUntilEpochMs)

    const todayEntries = snapshot.entries.filter((entry) => entry.dayOffset === currentDayOffset)
    expect(todayEntries.map((entry) => entry.id)).toEqual([`MATH#2026-11-02`])
    expect(todayEntries[0].startEpochMs).toBeGreaterThan(now)
  })

  it('条数超过上限时按天截断，并且不会留下「有日期但没课程」的假无课窗口', () => {
    // 每天 10 节课 × 7 天 = 每周 70 条，远超 800 条上限，必然触发截断。
    const manyClasses = Array.from({ length: 70 }, (_, index) =>
      makeClass({
        id: `C${index}`,
        dayOfWeek: (index % 7) + 1,
        weeks: allWeeks,
        startTime: `${(8 + Math.floor(index / 7)).toString().padStart(2, '0')}:00`,
        endTime: `${(8 + Math.floor(index / 7)).toString().padStart(2, '0')}:50`,
      })
    )

    const snapshot = buildWidgetSnapshot(
      { classes: manyClasses, currentWeek: 1, firstWeekStartDate: FIRST_WEEK_START },
      localDate(2026, 9, 7, 7, 0)
    )

    expect(snapshot.entries.length).toBeLessThanOrEqual(WIDGET_MAX_ENTRIES)
    // 截断后覆盖窗口必须跟着收缩：validUntil 等于最后一个完整覆盖日的结束时刻，
    // 否则原生会在窗口内某天判定「今天无课」。
    expect(snapshot.dayEndEpochMs.length).toBeLessThan(140)
    expect(snapshot.validUntilEpochMs).toBe(snapshot.dayEndEpochMs[snapshot.dayEndEpochMs.length - 1])
    expect(snapshot.entries.every((entry) => entry.dayOffset < snapshot.dayEndEpochMs.length)).toBe(true)
    // 被覆盖的最后一天仍然是有课程的，不能被截成空日。
    expect(snapshot.entries.some((entry) => entry.dayOffset === snapshot.dayEndEpochMs.length - 1)).toBe(true)
  })

  it('典型学期（20 周 × 每周 25 节）的快照体积远低于跨层上限', () => {
    // 周一到周五各 5 节。
    const weekClasses = Array.from({ length: 25 }, (_, index) =>
      makeClass({
        id: `C${index}`,
        name: `课程${index}`,
        classroom: `教学楼${index}`,
        dayOfWeek: Math.floor(index / 5) + 1,
        weeks: allWeeks,
        startTime: `${(8 + (index % 5) * 2).toString().padStart(2, '0')}:00`,
        endTime: `${(8 + (index % 5) * 2 + 2).toString().padStart(2, '0')}:00`,
      })
    )

    const snapshot = buildWidgetSnapshot(
      { classes: weekClasses, currentWeek: 1, firstWeekStartDate: FIRST_WEEK_START },
      localDate(2026, 9, 7, 7, 0)
    )

    expect(snapshot.dayEndEpochMs.length).toBe(140)
    expect(snapshot.entries.length).toBe(500)

    const json = serializeWidgetSnapshot(snapshot)
    expect(getWidgetSnapshotByteLength(json)).toBeLessThan(WIDGET_SNAPSHOT_MAX_BYTES)
  })

  it('与 features/schedule 的周次语义保持一致（防止两侧规则分叉）', () => {
    const classes = [makeClass({ id: 'A', dayOfWeek: 1, weeks: [1, 3] }), makeClass({ id: 'B', dayOfWeek: 2, weeks: [21] })]

    // 窗口末日 = 第一周第一天 + getMaxWeek × 7 - 1，再取其次日 00:00。
    const maxWeek = getMaxWeek(classes)
    expect(maxWeek).toBe(21)

    const snapshot = buildWidgetSnapshot({ classes, currentWeek: 1, firstWeekStartDate: FIRST_WEEK_START }, localDate(2026, 9, 7, 7, 0))
    const expectedDays = Math.min(maxWeek * 7, 400)

    expect(snapshot.dayEndEpochMs.length).toBe(expectedDays)
    expect(snapshot.validUntilEpochMs).toBe(localEpoch(2026, 9, 8 + maxWeek * 7 - 1))
  })

  it('星期标签与 features/schedule 的 dayNames 同源', () => {
    const classes = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => makeClass({ id: `D${dayOfWeek}`, dayOfWeek }))

    const snapshot = buildWidgetSnapshot({ classes, currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START }, localDate(2026, 9, 21, 6, 0))

    // 覆盖窗口内 7 个星期都会出现，逐个核对标签来源一致。
    const labels = new Set<string>()
    for (const entry of snapshot.entries) {
      const dayOfWeek = Number(entry.id.replace('D', '').split('#')[0])
      expect(entry.weekdayLabel).toBe(dayNames[dayOfWeek])
      labels.add(entry.weekdayLabel)
    }

    expect(snapshot.entries.length).toBeGreaterThan(0)
    expect(labels.size).toBe(7)
  })

  it('时间字段非法或结束不晚于开始的课程被丢弃，不影响其它课程', () => {
    const broken = makeClass({ id: 'BROKEN', dayOfWeek: 1, weeks: [3], startTime: '25:99', endTime: '26:00' })
    const inverted = makeClass({ id: 'INVERTED', dayOfWeek: 1, weeks: [3], startTime: '10:00', endTime: '09:00' })
    const normal = makeClass({ id: 'NORMAL', dayOfWeek: 1, weeks: [3], startTime: '10:00', endTime: '11:40' })

    const snapshot = buildWidgetSnapshot(
      { classes: [broken, inverted, normal], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START },
      WEEK3_MONDAY
    )

    expect(snapshot.entries.map((entry) => entry.id)).toEqual([`NORMAL#${WEEK3_MONDAY_DATE}`])
  })

  it('生成的诊断字段带有本地时区偏移', () => {
    const snapshot = buildWidgetSnapshot(
      { classes: [makeClass({ id: 'MATH', dayOfWeek: 1 })], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START },
      WEEK3_MONDAY
    )

    expect(snapshot.generatedAt).toMatch(/^2026-09-21T09:00:00[+-]\d{2}:\d{2}$/)
    expect(snapshot.timezone).toBeTruthy()
  })
})

describe('getWidgetSnapshotByteLength', () => {
  it('按 UTF-8 统计字节数，不会因为中文而低估', () => {
    const json = serializeWidgetSnapshot(
      buildWidgetSnapshot(
        { classes: [makeClass({ id: 'MATH', name: '高等数学', dayOfWeek: 1 })], currentWeek: 3, firstWeekStartDate: FIRST_WEEK_START },
        WEEK3_MONDAY
      )
    )

    expect(getWidgetSnapshotByteLength(json)).toBeGreaterThan(json.length)
  })
})
