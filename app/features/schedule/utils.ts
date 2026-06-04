import { addDays } from 'date-fns'
import type { Class } from '~/lib/types'
import { courseColors } from './constants'

/**
 * 根据课程 ID 为课程分配一个稳定的课表颜色。
 *
 * 课表中同一门课需要在不同周次、不同页面刷新后保持相同颜色，因此这里
 * 使用课程 ID 计算简单哈希，再映射到预设调色板。只要课程 ID 不变，
 * 返回的颜色就不会变化。
 *
 * @param courseId 课程的稳定标识，通常来自解析后的课程号或教学班信息。
 * @returns `courseColors` 中的一个颜色配置。
 */
export function getCourseColor(courseId: string) {
  let hash = 0
  for (let index = 0; index < courseId.length; index++) {
    hash = courseId.charCodeAt(index) + ((hash << 5) - hash)
  }
  return courseColors[Math.abs(hash) % courseColors.length]
}

/**
 * 计算指定教学周和星期对应的自然日期。
 *
 * 项目约定 `firstWeekStartDate` 是第一周第一天，`dayOfWeek` 使用
 * 周一为 1、周日为 7 的编号。函数会基于这两个约定计算偏移天数，
 * 用于课表表头展示 `MM.dd` 日期。
 *
 * @param firstWeekStartDate 第一周第一天的 ISO 日期字符串；为空时无法计算日期。
 * @param currentWeek 当前展示的教学周，从 1 开始。
 * @param dayOfWeek 当前周内的星期编号，范围通常为 1-7。
 * @returns 对应的日期对象；缺少或无法解析起始日期时返回 `null`。
 */
export function getDayDate(firstWeekStartDate: string | null, currentWeek: number, dayOfWeek: number) {
  if (!firstWeekStartDate) return null

  try {
    const baseDate = new Date(firstWeekStartDate)
    const daysOffset = (currentWeek - 1) * 7 + (dayOfWeek - 1)
    return addDays(baseDate, daysOffset)
  } catch {
    return null
  }
}

/**
 * 获取当前课程数据中出现过的最大教学周。
 *
 * 课程数据中的 `weeks` 表示该课程在哪些周上课。课表翻页、当前周限制
 * 和统计范围都需要知道最大的周次。没有课程或课程周次数组为空时，
 * 使用 20 周作为常见学期长度兜底。
 *
 * @param classes 已导入的课程列表。
 * @returns 课程中出现的最大周次，最小兜底值为 20。
 */
export function getMaxWeek(classes: Class[]) {
  return classes.reduce((max, classItem) => {
    const classMaxWeek = Math.max(...classItem.weeks)
    return Math.max(max, classMaxWeek)
  }, 20)
}

/**
 * 根据第一周第一天计算今天所在的教学周。
 *
 * 当用户设置了学期开始日期后，应用可以自动推算现实中的当前周次。
 * 返回值会被限制在 `1` 到 `maxWeek` 之间，避免学期开始前或学期结束后
 * 产生超出课表范围的周次。
 *
 * @param firstWeekStartDate 第一周第一天的 ISO 日期字符串；为空时返回第 1 周。
 * @param maxWeek 当前课程数据允许展示的最大周次。
 * @returns 推算出的当前教学周。
 */
export function getCurrentWeek(firstWeekStartDate: string | null, maxWeek: number) {
  if (!firstWeekStartDate) return 1

  try {
    const baseDate = new Date(firstWeekStartDate)
    const today = new Date()
    const diffTime = today.getTime() - baseDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    const week = Math.floor(diffDays / 7) + 1
    return Math.min(Math.max(week, 1), maxWeek)
  } catch {
    return 1
  }
}
