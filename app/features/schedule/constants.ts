export const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

export const weekDays = [1, 2, 3, 4, 5, 6, 7]

export const sections = Array.from({ length: 12 }, (_, index) => index + 1)

export const courseColors = [
  'bg-gradient-to-b from-emerald-400 to-emerald-500 text-white',
  'bg-gradient-to-b from-sky-400 to-blue-500 text-white',
  'bg-gradient-to-b from-rose-400 to-pink-500 text-white',
  'bg-gradient-to-b from-orange-300 to-orange-400 text-white',
  'bg-gradient-to-b from-violet-400 to-purple-500 text-white',
  'bg-gradient-to-b from-amber-300 to-amber-400 text-white',
  'bg-gradient-to-b from-teal-400 to-cyan-500 text-white',
  'bg-gradient-to-b from-lime-400 to-green-500 text-white',
]

/** 移动端课表可用的缩放档位；双指捏合与 −/+ 按钮最终都吸附到这三个值。 */
export const ZOOM_TIERS = [1, 1.5, 2] as const

/** 缩放下界：1x 时网格宽度恰好等于容器宽度，因此不会出现横向滚动。 */
export const ZOOM_MIN = ZOOM_TIERS[0]

/** 缩放上界。 */
export const ZOOM_MAX = ZOOM_TIERS[ZOOM_TIERS.length - 1]

/** 达到该缩放值后，课程块开始显示教室。 */
export const DETAIL_STANDARD_THRESHOLD = 1.35

/** 达到该缩放值后，课程块开始显示教师与备注。 */
export const DETAIL_FULL_THRESHOLD = 1.9
