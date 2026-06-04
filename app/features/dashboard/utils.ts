import type { Class, ClassMark } from '~/lib/types'

export type CourseSession = {
  id: string
  classItem: Class
  week: number
  mark?: ClassMark
  isPast: boolean
}

export type DashboardRange = {
  currentWeek: number
  currentDayOfWeek: number
  hasDateBase: boolean
  label: string
}

/**
 * 构建数据看板用于判定“已发生课程”的时间范围。
 *
 * 如果用户设置了第一周第一天，则按真实日期推算当前教学周和星期；
 * 如果未设置或日期无效，则回退到界面当前选择的周次，并把星期视为周日，
 * 表示该周内课程都可以纳入估算范围。
 *
 * @param firstWeekStartDate 第一周第一天的 ISO 日期字符串。
 * @param fallbackWeek 无法按日期计算时使用的当前周次。
 * @param maxWeek 当前课程数据允许统计的最大周次。
 * @returns 看板统计范围，包含周次、星期、是否有真实日期依据和展示文案。
 */
export function getDashboardRange(firstWeekStartDate: string | null, fallbackWeek: number, maxWeek: number): DashboardRange {
  if (!firstWeekStartDate) {
    return {
      currentWeek: fallbackWeek,
      currentDayOfWeek: 7,
      hasDateBase: false,
      label: `按当前第 ${fallbackWeek} 周估算`,
    }
  }

  const baseDate = new Date(firstWeekStartDate)
  if (Number.isNaN(baseDate.getTime())) {
    return {
      currentWeek: fallbackWeek,
      currentDayOfWeek: 7,
      hasDateBase: false,
      label: `按当前第 ${fallbackWeek} 周估算`,
    }
  }

  const today = new Date()
  const diffDays = Math.floor((startOfDay(today).getTime() - startOfDay(baseDate).getTime()) / (1000 * 60 * 60 * 24))
  const currentWeek = Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), maxWeek)
  const currentDayOfWeek = Math.min(Math.max((diffDays % 7) + 1, 1), 7)

  return {
    currentWeek,
    currentDayOfWeek,
    hasDateBase: true,
    label: `统计至第 ${currentWeek} 周 周${toChineseWeekday(currentDayOfWeek)}`,
  }
}

/**
 * 将课程定义展开成逐周课次，并关联每个课次的出勤标记。
 *
 * 解析器导入的课程是一条“在多个周次重复出现”的定义，而看板统计需要以
 * 单次课为单位计算已上、缺勤、未标记和风险课程。因此这里会遍历每门课的
 * `weeks`，生成一条条具体课次，并根据 `classMarks` 附加对应标记。
 *
 * @param classes 已导入的课程列表。
 * @param classMarks 以 `课程ID-周次` 为 key 的出勤标记表。
 * @param range 看板当前统计范围，用于判断课次是否已经发生。
 * @returns 展开后的逐周课次数组。
 */
export function expandCourseSessions(classes: Class[], classMarks: Record<string, ClassMark>, range: DashboardRange): CourseSession[] {
  return classes.flatMap((classItem) =>
    classItem.weeks.map((week) => {
      const mark = classMarks[getMarkKey(classItem.id, week)]
      return {
        id: `${classItem.id}-${week}`,
        classItem,
        week,
        mark,
        isPast: isPastSession(week, classItem.dayOfWeek, range),
      }
    })
  )
}

/**
 * 生成课程在指定周次的出勤标记存储键。
 *
 * 出勤标记按“课程实例 + 周次”唯一定位，同一门课在不同周次可以有不同的
 * 已上状态和备注。这个 key 需要在课表、看板和状态管理中保持一致。
 *
 * @param classId 解析后的课程唯一 ID。
 * @param week 教学周次。
 * @returns 形如 `classId-week` 的存储键。
 */
export function getMarkKey(classId: string, week: number) {
  return `${classId}-${week}`
}

/**
 * 将数值格式化为百分比文案。
 *
 * 看板图表和指标卡只需要整数百分比，因此这里会四舍五入。如果传入值不是
 * 有限数字，比如 `NaN` 或 `Infinity`，会返回 `0%`，避免界面出现异常文本。
 *
 * @param value 百分比数值，例如 `62.5` 表示 62.5%。
 * @returns 整数百分比字符串。
 */
export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value)}%`
}

/**
 * 计算百分比，并处理总数为 0 的情况。
 *
 * 统计项没有样本时直接相除会得到无效结果。该函数在 `total` 为 0 时返回 0，
 * 其余情况返回 `value / total * 100`，供看板统一格式化。
 *
 * @param value 分子数量。
 * @param total 分母总数。
 * @returns 百分比数值。
 */
export function safeRate(value: number, total: number) {
  if (total === 0) return 0
  return (value / total) * 100
}

/**
 * 将应用内部的星期编号转换成中文星期标签。
 *
 * 应用中星期使用周一为 1、周日为 7 的编号；这里返回单字标签，
 * 适合拼接成“周一”“周二”等紧凑展示文案。
 *
 * @param dayOfWeek 星期编号，通常为 1-7。
 * @returns 对应的中文单字；超出范围时返回原始数字字符串。
 */
export function toChineseWeekday(dayOfWeek: number) {
  return ['一', '二', '三', '四', '五', '六', '日'][dayOfWeek - 1] || String(dayOfWeek)
}

/**
 * 判断指定周次和星期的课次是否落在看板已发生范围内。
 *
 * 早于当前统计周的课次一定已发生；晚于当前统计周的课次一定未发生；
 * 同一周内则比较星期编号。该函数不比较具体上下课时间，只用于看板的
 * 周/日级别统计。
 *
 * @param week 课次所在教学周。
 * @param dayOfWeek 课次所在星期，周一为 1、周日为 7。
 * @param range 看板当前统计范围。
 * @returns 课次是否应被视为已发生。
 */
function isPastSession(week: number, dayOfWeek: number, range: DashboardRange) {
  if (week < range.currentWeek) return true
  if (week > range.currentWeek) return false
  return dayOfWeek <= range.currentDayOfWeek
}

/**
 * 返回一个被截断到本地零点的日期副本。
 *
 * 日期差计算只关心自然日，不关心当前小时分钟。复制后再清零可以避免
 * 修改调用方传入的 `Date` 实例，同时避免时间部分影响天数差。
 *
 * @param date 原始日期。
 * @returns 同一天本地 00:00:00.000 的新日期对象。
 */
function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}
