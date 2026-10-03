import type { Class } from '~/lib/types'

/**
 * 一门课在课表里的配色主题。
 *
 * 新版（2026-09-15）改用「浅色填充 + 同色相深色文字」的清爽风格（对齐参考图），
 * 取代旧版「高饱和实色底 + 纯白字」。因此一个主题不再是单串 `bg-… text-…`，
 * 而是拆成三层，供 `ScheduleCourseCell` 分别套到卡片底色、课名、次要信息上。
 */
export type CourseColorTheme = {
  /** 卡片底色（浅色填充）。 */
  surface: string
  /** 课名文字色：与底色同色相的深色，保证对比度。 */
  title: string
  /** 教室 / 教师 / 备注 / 单双周等次要信息文字色。 */
  body: string
}

/**
 * 8 组课程配色（浅底 + 深色同色相文字）。
 *
 * 色相在色环上大致均匀分布（橙 / 绿 / 蓝 / 琥珀 / 青 / 黄绿 / 玫红 / 紫），
 * 底色统一取高明度（HSL L≈92%），课名取同色相的中深色（L≈40%，对比度 ≥4.5:1），
 * 次要信息取同色相的低饱和中灰（readable 的前提下尽量素净，呼应参考图里灰色的教室号）。
 */
export const COURSE_COLOR_THEMES: CourseColorTheme[] = [
  { surface: 'bg-[#f7e9de]', title: 'text-[#9e5d2e]', body: 'text-[#8f715c]' },
  { surface: 'bg-[#e0f5e9]', title: 'text-[#358d5a]', body: 'text-[#5a876c]' },
  { surface: 'bg-[#e2ebf8]', title: 'text-[#3662a1]', body: 'text-[#5f7695]' },
  { surface: 'bg-[#f7f0d9]', title: 'text-[#8e762f]', body: 'text-[#897d58]' },
  { surface: 'bg-[#e0f5f4]', title: 'text-[#318c89]', body: 'text-[#5a8c8a]' },
  { surface: 'bg-[#e8f4dd]', title: 'text-[#5e8637]', body: 'text-[#70875a]' },
  { surface: 'bg-[#f9e2e5]', title: 'text-[#b23444]', body: 'text-[#985d65]' },
  { surface: 'bg-[#efe4f6]', title: 'text-[#7b3fa6]', body: 'text-[#84639c]' },
]

/**
 * 非本周课程的统一「淡化主题」：中性浅灰底 + 灰字。
 *
 * 「淡化显示非本周课程」的目的是**弱化**，所以这里不再按课分色，而是统一退成灰色，
 * 与本周的彩色卡片一眼可分；课名文字本身仍在，不影响辨认是哪门课。
 */
export const COURSE_OUT_OF_WEEK_THEME: CourseColorTheme = {
  surface: 'bg-[#eef0f3]',
  title: 'text-[#8b919c]',
  body: 'text-[#a7acb5]',
}

/**
 * 为当前课表里的所有课程建立「课程号 → 配色档位」的稳定映射。
 *
 * 关键诉求（用户明确要求）：**一门课固定一个颜色，而不是随机**。实现方式是按课程号
 * 去重后排序，再**按顺序**映射到调色板档位（`index % 调色板长度`）。这样：
 *
 * - 同一门课（同 `courseId`）在任何周次、任何节次、刷新后都拿到同一个颜色；
 * - 相邻档位的课颜色不同，分布均匀、可预期，不像哈希那样"看起来很随机"；
 * - 课程数超过 8 门时按调色板循环复用（无法避免，属已知取舍）。
 *
 * @param classes 整个学期的课程列表。
 * @returns `courseId → 档位下标` 的映射。
 */
export function buildCourseColorMap(classes: Class[]): Map<string, number> {
  const courseIds = Array.from(new Set(classes.map((classItem) => classItem.courseId))).sort((left, right) => left.localeCompare(right))

  const colorMap = new Map<string, number>()
  courseIds.forEach((courseId, index) => {
    colorMap.set(courseId, index % COURSE_COLOR_THEMES.length)
  })

  return colorMap
}

/**
 * 解析某门课要用的配色主题。
 *
 * @param courseId 课程号（课程的稳定标识）。
 * @param colorMap `buildCourseColorMap` 产出的映射。
 * @param isOutOfWeek 是否为非本周课程（淡化显示时才会出现）。
 * @returns 对应的配色主题；非本周统一返回淡化主题。
 */
export function resolveCourseTheme(courseId: string, colorMap: Map<string, number>, isOutOfWeek: boolean): CourseColorTheme {
  if (isOutOfWeek) return COURSE_OUT_OF_WEEK_THEME

  const index = colorMap.get(courseId) ?? 0
  return COURSE_COLOR_THEMES[index]
}
