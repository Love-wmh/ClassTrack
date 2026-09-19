import type { Class } from '~/lib/types'

/**
 * 桌面小工具快照的 schema 版本。
 *
 * 原生侧只接受这一版本；不匹配时按「无可用快照」处理并保留原文件，不抛异常。
 * 这是一个跨层冻结契约，改动字段必须同时改 `design.md` 的 D2 与 Android 侧解析器。
 */
export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 1

/**
 * 快照 JSON 的字节上限，与 Android 侧 `WidgetSnapshotStore` 的校验阈值保持一致。
 *
 * 超限时原生侧会以 `PAYLOAD_TOO_LARGE` 拒绝写入，因此 Web 侧必须在推送前
 * 用 `getWidgetSnapshotByteLength` 自检，避免把一次注定失败的负载送过桥。
 */
export const WIDGET_SNAPSHOT_MAX_BYTES = 256 * 1024

/**
 * `entries` 条数上限。
 *
 * 一个 20 周、每周 25 节的学期约产生 500 条按时间展开的 occurrence，
 * 因此 800 条既够覆盖整个学期，又能兜住畸形的课程数据。
 */
export const WIDGET_MAX_ENTRIES = 800

/**
 * 覆盖窗口的天数上限。
 *
 * `weeks` 来自教务系统解析结果，理论上可以出现异常大的周次。若不设上限，
 * 窗口会被撑到数千天，快照体积和 `dayEndEpochMs` 都会失控。
 */
export const WIDGET_MAX_WINDOW_DAYS = 400

/**
 * 学期长度的兜底周数。
 *
 * 与 `app/features/schedule/utils.ts` 的 `getMaxWeek` 使用同一个兜底值。
 * 这里不直接 import 该函数，是因为 `app/lib` 不依赖 `app/features`（依赖方向
 * 单向：feature → lib）；两侧语义由 `widget-snapshot.test.ts` 的跨模块一致性
 * 用例锁住，规则一旦分叉测试会失败。
 */
const FALLBACK_SEMESTER_WEEKS = 20

/** 与 `Class.dayOfWeek` 同源（1 为周一、7 为周日）的中文星期标签。 */
const WEEKDAY_LABELS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 快照整体状态，用于让原生区分「没数据」的三种不同原因。 */
export type WidgetSnapshotStatus =
  /** 正常：`entries` 可能为空（当天没课），但学期与日期都已知。 */
  | 'ok'
  /** 课表为空（尚未导入课程）。 */
  | 'empty'
  /** 缺少学期开始日期，无法推算日历日期。 */
  | 'unavailable'

/** 一次具体的上课发生（某个自然日的一节课），时间已解析为绝对时刻。 */
export type WidgetOccurrence = {
  /** 同一节课的稳定标识：`<Class.id>#<本地日期>`。 */
  id: string
  name: string
  classroom: string
  /** 节次标签，如 `3-4`；只有一节时为 `3`。 */
  sections: string
  /** 绝对起始时刻（epoch 毫秒）。 */
  startEpochMs: number
  /** 绝对结束时刻（epoch 毫秒）。 */
  endEpochMs: number
  /** 预格式化的开始时间，如 `08:00`。 */
  startLabel: string
  /** 预格式化的结束时间，如 `09:40`。 */
  endLabel: string
  /** 本地日期，如 `2026-09-19`。 */
  dayKey: string
  /** 相对快照生成当天的天数偏移，0 表示生成当天。 */
  dayOffset: number
  /** 中文星期标签，如 `周三`。 */
  weekdayLabel: string
}

/** Web → 原生 的唯一跨层契约。字段定义见 `design.md` D2，未经评审不得增减。 */
export type WidgetSnapshotV1 = {
  schemaVersion: typeof WIDGET_SNAPSHOT_SCHEMA_VERSION
  status: WidgetSnapshotStatus
  /** 快照生成时刻。 */
  generatedAtEpochMs: number
  /** 覆盖窗口结束时刻（最后一个被覆盖自然日的本地 24:00）。超过它即视为过期。 */
  validUntilEpochMs: number
  /** 按 `startEpochMs` 升序排列的上课发生，最多 `WIDGET_MAX_ENTRIES` 条。 */
  entries: WidgetOccurrence[]
  /** 下标即 `dayOffset`，值为该自然日本地 24:00 的 epoch；覆盖窗口内每一天各一项。 */
  dayEndEpochMs: number[]
  /** ISO 8601 含本地时区偏移，仅用于诊断，不参与判定。 */
  generatedAt: string
  /** IANA 时区名，仅用于诊断。 */
  timezone: string
}

export type WidgetSnapshotInput = {
  classes: Class[]
  currentWeek: number
  firstWeekStartDate: string | null
}

/**
 * 把 `YYYY-MM-DD` 解析为**本地时区**的当日 00:00。
 *
 * 刻意不用 `new Date('2026-09-19')`：那种写法按 UTC 解析，在 UTC+8 会变成
 * 前一天 08:00，日期整体偏移一天（既有的 `getDayDate` 就有这个隐患）。
 *
 * @param value `YYYY-MM-DD` 形式的日期字符串。
 * @returns 本地时区的当日 00:00；格式非法或日期不存在时返回 `null`。
 */
function parseLocalDate(value: string): Date | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!matched) return null

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)

  // 用回读校验挡住 2026-02-30 这类「格式合法但日期不存在」的输入。
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

/**
 * 取某时刻所在自然日的本地 00:00。
 *
 * @param date 任意时刻。
 * @returns 同一自然日的本地 00:00。
 */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * 在本地日历上加减天数。
 *
 * 用「构造新 Date」而不是加固定毫秒数，这样夏令时切换当天也不会偏移一天。
 *
 * @param date 起点。
 * @param days 需要增加的天数，可为负。
 * @returns 偏移后的本地 00:00（当传入的是当日 00:00 时）。
 */
function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * 计算两个本地 00:00 之间相差的自然日数。
 *
 * @param from 起点（应为本地 00:00）。
 * @param to 终点（应为本地 00:00）。
 * @returns 相差天数，同日为 0。
 */
function diffInDays(from: Date, to: Date): number {
  // 用 round 而不是 floor：夏令时会把某些天变成 23 或 25 小时。
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/**
 * 把 `HH:mm` 与某个自然日组合成本地绝对时刻。
 *
 * @param day 目标自然日（使用其年月日）。
 * @param time `HH:mm` 形式的时间字符串。
 * @returns epoch 毫秒；格式非法时返回 `null`。
 */
function localTimeToEpoch(day: Date, time: string): number | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!matched) return null

  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) return null

  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime()
}

/**
 * 把 `H:mm` 归一为 `HH:mm`，供原生直接展示（原生不做任何格式化）。
 *
 * @param time 原始时间字符串。
 * @returns 补零后的时间字符串；无法识别时原样返回。
 */
function normalizeTimeLabel(time: string): string {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!matched) return time
  return `${matched[1].padStart(2, '0')}:${matched[2]}`
}

/**
 * 生成本地日期键 `YYYY-MM-DD`。
 *
 * @param date 目标自然日。
 * @returns 本地日期字符串。
 */
function formatLocalDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 生成带本地时区偏移的 ISO 8601 字符串。
 *
 * 不用 `toISOString()`：它输出 UTC，诊断时会与用户实际看到的本地时间差一天。
 *
 * @param date 目标时刻。
 * @returns 形如 `2026-09-19T10:00:00+08:00` 的字符串。
 */
function toLocalIsoWithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offsetHours = `${Math.floor(Math.abs(offsetMinutes) / 60)}`.padStart(2, '0')
  const offsetRest = `${Math.abs(offsetMinutes) % 60}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  const second = `${date.getSeconds()}`.padStart(2, '0')

  return `${formatLocalDayKey(date)}T${hour}:${minute}:${second}${sign}${offsetHours}:${offsetRest}`
}

/**
 * 取运行环境的 IANA 时区名，仅用于诊断。
 *
 * @returns 时区名；无法获取时返回 `unknown`。
 */
function resolvedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * 把 `dayOfWeek`（周一为 1、周日为 7）转回 `Date.getDay()`（周日为 0）的星期编号。
 *
 * @param date 目标自然日。
 * @returns 1-7，周一为 1。
 */
function weekdayOf(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
}

/**
 * 取课程数据中出现的最大教学周。
 *
 * 与 `app/features/schedule/utils.ts` 的 `getMaxWeek` 语义一致：取所有课程
 * `weeks` 的最大值，空数据时兜底 `FALLBACK_SEMESTER_WEEKS`。
 *
 * @param classes 已导入的课程列表。
 * @returns 最大教学周，至少为 `FALLBACK_SEMESTER_WEEKS`。
 */
function maxWeekOf(classes: Class[]): number {
  return classes.reduce((max, classItem) => {
    const classMax = classItem.weeks.length > 0 ? Math.max(...classItem.weeks) : Number.NEGATIVE_INFINITY
    return Math.max(max, classMax)
  }, FALLBACK_SEMESTER_WEEKS)
}

/**
 * 生成节次标签。
 *
 * @param startSection 起始节次。
 * @param endSection 结束节次。
 * @returns 起止不同时为 `3-4`，相同时为 `3`。
 */
function formatSections(startSection: number, endSection: number): string {
  return startSection === endSection ? `${startSection}` : `${startSection}-${endSection}`
}

/**
 * 把一条 `Class` 在指定自然日的上课发生转换为快照条目。
 *
 * @param classItem 课程数据。
 * @param date 目标自然日。
 * @param dayKey 目标自然日的本地日期键。
 * @param dayOffset 相对快照生成当天的天数偏移。
 * @param dayOfWeek 目标自然日的星期编号（周一为 1）。
 * @returns 快照条目；时间字段非法或结束不晚于开始时返回 `null`（丢弃而不是渲染异常数据）。
 */
function toOccurrence(classItem: Class, date: Date, dayKey: string, dayOffset: number, dayOfWeek: number): WidgetOccurrence | null {
  const startEpochMs = localTimeToEpoch(date, classItem.startTime)
  const endEpochMs = localTimeToEpoch(date, classItem.endTime)
  if (startEpochMs === null || endEpochMs === null || endEpochMs <= startEpochMs) return null

  return {
    id: `${classItem.id}#${dayKey}`,
    name: classItem.name,
    classroom: classItem.classroom ?? '',
    sections: formatSections(classItem.startSection, classItem.endSection),
    startEpochMs,
    endEpochMs,
    startLabel: normalizeTimeLabel(classItem.startTime),
    endLabel: normalizeTimeLabel(classItem.endTime),
    dayKey,
    dayOffset,
    weekdayLabel: WEEKDAY_LABELS[dayOfWeek] ?? '',
  }
}

/**
 * 从当前课表数据生成桌面小工具快照。
 *
 * 覆盖窗口从 `now` 所在自然日一直延伸到学期最后一周的最后一天，下界至少覆盖
 * 「今天」。这样即使用户长期不打开 App，原生仍能凭 `dayEndEpochMs` 判断
 * 「今天是第几天」并裁出当天剩余课程，而不是把昨天的列表当成今天。
 *
 * 时间计算全部在本地时区完成：原生侧只做 epoch 比较，不做任何日期或时区推算。
 *
 * @param input 当前课表数据，取自 Zustand store 的扁平投影。
 * @param now 生成时刻；显式传入以便测试与去抖逻辑复用同一时刻。
 * @returns 版本化的快照对象。
 */
export function buildWidgetSnapshot(input: WidgetSnapshotInput, now: Date): WidgetSnapshotV1 {
  const generatedAtEpochMs = now.getTime()
  const base = {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    generatedAtEpochMs,
    generatedAt: toLocalIsoWithOffset(now),
    timezone: resolvedTimeZone(),
  } as const

  if (input.classes.length === 0) {
    return { ...base, status: 'empty', validUntilEpochMs: generatedAtEpochMs, entries: [], dayEndEpochMs: [] }
  }

  const firstWeekDate = input.firstWeekStartDate ? parseLocalDate(input.firstWeekStartDate) : null
  if (!firstWeekDate) {
    return { ...base, status: 'unavailable', validUntilEpochMs: generatedAtEpochMs, entries: [], dayEndEpochMs: [] }
  }

  const today = startOfLocalDay(now)
  const maxWeek = maxWeekOf(input.classes)
  const semesterEndDate = addLocalDays(firstWeekDate, maxWeek * 7 - 1)
  const windowEndDate = semesterEndDate.getTime() > today.getTime() ? semesterEndDate : today
  const windowDays = Math.min(diffInDays(today, windowEndDate) + 1, WIDGET_MAX_WINDOW_DAYS)

  const entries: WidgetOccurrence[] = []
  const dayEndEpochMs: number[] = []

  for (let dayOffset = 0; dayOffset < windowDays; dayOffset += 1) {
    const date = addLocalDays(today, dayOffset)
    const dayKey = formatLocalDayKey(date)
    const dayOfWeek = weekdayOf(date)
    const week = Math.floor(diffInDays(firstWeekDate, date) / 7) + 1
    const isWithinSemester = week >= 1 && week <= maxWeek

    const dayEntries: WidgetOccurrence[] = []
    if (isWithinSemester) {
      for (const classItem of input.classes) {
        if (classItem.dayOfWeek !== dayOfWeek) continue
        if (!classItem.weeks.includes(week)) continue

        const occurrence = toOccurrence(classItem, date, dayKey, dayOffset, dayOfWeek)
        // 已经结束的课不进入快照：原生永远不会把已结束的课当作 hero 或今日剩余，
        // 提前丢掉可以显著缩小 payload。进行中的课 `endEpochMs > now`，不会被丢弃。
        if (occurrence && occurrence.endEpochMs > generatedAtEpochMs) dayEntries.push(occurrence)
      }
    }

    // 首日必须整日纳入（否则「今天」会没有可用的边界信息）；其后按条数上限截断。
    if (dayOffset > 0 && entries.length + dayEntries.length > WIDGET_MAX_ENTRIES) break

    dayEntries.sort((left, right) => left.startEpochMs - right.startEpochMs || left.id.localeCompare(right.id))
    entries.push(...dayEntries)
    dayEndEpochMs.push(startOfLocalDay(addLocalDays(date, 1)).getTime())
  }

  entries.sort((left, right) => left.startEpochMs - right.startEpochMs || left.id.localeCompare(right.id))

  const validUntilEpochMs = dayEndEpochMs.length > 0 ? dayEndEpochMs[dayEndEpochMs.length - 1] : generatedAtEpochMs

  return { ...base, status: 'ok', validUntilEpochMs, entries, dayEndEpochMs }
}

/**
 * 序列化快照，供 Capacitor 插件传输。
 *
 * @param snapshot 快照对象。
 * @returns JSON 字符串。
 */
export function serializeWidgetSnapshot(snapshot: WidgetSnapshotV1): string {
  return JSON.stringify(snapshot)
}

/**
 * 计算快照 JSON 的 UTF-8 字节长度。
 *
 * 用 `TextEncoder` 而不是 `String.length`：后者统计的是 UTF-16 码元，中文课程名
 * 会低估一半，导致 Web 侧以为没超限而原生侧以 `PAYLOAD_TOO_LARGE` 拒绝。
 *
 * @param json 已序列化的快照。
 * @returns UTF-8 字节数。
 */
export function getWidgetSnapshotByteLength(json: string): number {
  return new TextEncoder().encode(json).length
}
