import { addDays } from 'date-fns'
import type { Class, ClassMark } from '~/lib/types'

/**
 * 为导入时刻之前已经结束的课次生成“已上”标记。
 *
 * 该函数用于课程表 JSON 导入后的初始化补标。它会遍历每门课的所有上课周次，
 * 判断该课次是否已经早于 `importedAt` 结束；如果是，则生成一条
 * `isAttended: true` 且备注为空的 `ClassMark`。调用方会再把这些标记
 * 与已有标记合并，因此这里不处理覆盖策略。
 *
 * 当设置了 `firstWeekStartDate` 时，会按真实日期和课程下课时间精确判断；
 * 未设置时，会回退到 `currentWeek`、导入当天星期和导入时刻做估算。
 *
 * @param classes 解析后的课程列表。
 * @param firstWeekStartDate 第一周第一天的 ISO 日期字符串；为空时使用当前周次回退判断。
 * @param currentWeek 当前教学周，用于缺少学期起始日期时的回退判断。
 * @param importedAt 导入发生的时间，默认是函数调用时刻。
 * @returns 以 `课程ID-周次` 为 key 的自动补充出勤标记。
 */
export function createPastClassMarks(
  classes: Class[],
  firstWeekStartDate: string | null,
  currentWeek: number,
  importedAt = new Date()
): Record<string, ClassMark> {
  const firstWeekStart = parseDateStart(firstWeekStartDate)

  return classes.reduce<Record<string, ClassMark>>((marks, classItem) => {
    classItem.weeks.forEach((week) => {
      const isPast = firstWeekStart
        ? isPastClassSessionByDate(classItem, week, firstWeekStart, importedAt)
        : isPastClassSessionByCurrentWeek(classItem, week, currentWeek, importedAt)

      if (!isPast) return

      marks[getMarkKey(classItem.id, week)] = {
        classId: classItem.id,
        week,
        isAttended: true,
        note: '',
      }
    })

    return marks
  }, {})
}

/**
 * 生成课程在指定周次的出勤标记存储键。
 *
 * 状态树中的 `classMarks` 使用对象存储，key 必须能唯一定位“一门课在某一周”
 * 的标记。这个函数集中维护 key 格式，避免各处手写字符串拼接产生不一致。
 *
 * @param classId 解析后的课程唯一 ID。
 * @param week 教学周次。
 * @returns 形如 `classId-week` 的存储键。
 */
export function getMarkKey(classId: string, week: number) {
  return `${classId}-${week}`
}

/**
 * 在已知学期起始日期时，判断某个课次是否早于导入时刻结束。
 *
 * 该路径是自动补标的精确判断方式。它会先把课程的周次、星期和下课时间
 * 转换成真实的本地日期时间，再与导入时间比较。
 *
 * @param classItem 课程定义。
 * @param week 当前判断的教学周。
 * @param firstWeekStart 第一周第一天的本地零点日期。
 * @param importedAt 导入发生的时间。
 * @returns 课次是否已经结束。
 */
function isPastClassSessionByDate(classItem: Class, week: number, firstWeekStart: Date, importedAt: Date) {
  const sessionEnd = getClassSessionEnd(classItem, week, firstWeekStart)
  if (!sessionEnd) return false

  return sessionEnd.getTime() <= importedAt.getTime()
}

/**
 * 在缺少学期起始日期时，根据当前周次估算课次是否已经结束。
 *
 * 回退逻辑只依赖应用当前周次和导入当天时间：早于当前周的课次视为已结束，
 * 晚于当前周的课次视为未发生；同一周内先比较星期，再比较课程下课时间。
 *
 * @param classItem 课程定义。
 * @param week 当前判断的教学周。
 * @param currentWeek 应用当前教学周。
 * @param importedAt 导入发生的时间。
 * @returns 课次是否应被视为已经结束。
 */
function isPastClassSessionByCurrentWeek(classItem: Class, week: number, currentWeek: number, importedAt: Date) {
  if (week < currentWeek) return true
  if (week > currentWeek) return false

  const currentDayOfWeek = toClassDayOfWeek(importedAt)
  if (classItem.dayOfWeek < currentDayOfWeek) return true
  if (classItem.dayOfWeek > currentDayOfWeek) return false

  const time = parseTime(classItem.endTime)
  if (!time) return false

  return time.hours * 60 + time.minutes <= importedAt.getHours() * 60 + importedAt.getMinutes()
}

/**
 * 计算某门课程在指定周次的本地下课日期时间。
 *
 * 课程数据只保存“第几周、星期几、几点下课”。该函数基于第一周第一天
 * 计算出真实日期，再把课程的 `endTime` 写入小时和分钟。
 *
 * @param classItem 课程定义，提供星期和下课时间。
 * @param week 当前判断的教学周。
 * @param firstWeekStart 第一周第一天的本地零点日期。
 * @returns 课次下课时间；无法解析下课时间时返回 `null`。
 */
function getClassSessionEnd(classItem: Class, week: number, firstWeekStart: Date) {
  const time = parseTime(classItem.endTime)
  if (!time) return null

  const sessionDate = addDays(firstWeekStart, (week - 1) * 7 + (classItem.dayOfWeek - 1))
  sessionDate.setHours(time.hours, time.minutes, 0, 0)

  return sessionDate
}

/**
 * 将日期字符串解析成本地零点日期。
 *
 * 对 `YYYY-MM-DD` 这种纯日期格式使用手动解析，避免浏览器把它按 UTC
 * 解释后在东八区等时区出现日期偏移。其他可解析日期格式则交给 `Date`
 * 构造函数处理。
 *
 * @param value 日期字符串；为空时表示没有可用日期。
 * @returns 本地 00:00:00.000 的日期对象；无法解析时返回 `null`。
 */
function parseDateStart(value: string | null) {
  if (!value) return null

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value)

  if (Number.isNaN(date.getTime())) return null

  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * 将 JavaScript 星期编号转换为应用内部的星期编号。
 *
 * JavaScript 的 `Date#getDay()` 使用周日为 0、周六为 6；课程数据使用
 * 周一为 1、周日为 7。这个转换用于同一周内比较课程星期和导入当天星期。
 *
 * @param date 需要转换星期编号的日期。
 * @returns 周一为 1、周日为 7 的星期编号。
 */
function toClassDayOfWeek(date: Date) {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

/**
 * 解析课程时间字符串中的小时和分钟。
 *
 * 教务系统导出的时间通常是 `HH:mm`，也可能带有秒或其他后缀。该函数只读取
 * 开头的小时和分钟，并校验它们处于正常时间范围内。
 *
 * @param value 课程开始或结束时间字符串。
 * @returns 解析出的小时和分钟；格式无效或越界时返回 `null`。
 */
function parseTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return { hours, minutes }
}
