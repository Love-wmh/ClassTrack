export const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

export const weekDays = [1, 2, 3, 4, 5, 6, 7]

export const sections = Array.from({ length: 12 }, (_, index) => index + 1)

/**
 * 课表课程格子的 8 组配色。
 *
 * 第七版（2026-09-24）：不再自己调色，改为**从参考图逐像素采样、原样复刻**。
 * 采样方法：对参考图做饱和度分割 + 连通域，取每张卡片区域的中位色，再分别取该卡上下半区验证
 * 是否存在渐变——实测顶/底差值 ≤2/255，即参考图卡片就是**平色、无渐变**（此前几版的渐变是自己加的）。
 *
 * 采样结果（8 组，均为参考图原色，未做任何调整）：薄荷/青蓝/紫蓝/藕荷紫/玫瑰/浅粉/珊瑚/金橙。
 * 参考图本身就有两档蓝（209°/218°）与两档粉（同色相不同饱和度），这里照搬、不做合并；
 * 文字保持纯白，非本周卡用参考图的卡其色 `#d4c3ae`（见 `ScheduleCourseCell`）。
 */
export const courseColors = [
  'bg-[#87e5d4] text-white',
  'bg-[#7bb7ef] text-white',
  'bg-[#84aef7] text-white',
  'bg-[#bcaaf5] text-white',
  'bg-[#ee7c9b] text-white',
  'bg-[#e7a0b3] text-white',
  'bg-[#e98d78] text-white',
  'bg-[#eab776] text-white',
]

/**
 * 非本周课程的「淡化色」，与 `courseColors` 同序、同哈希档位。
 *
 * 参考图里非本周卡不是钉死的卡其色，而是**由该课自己的颜色淡化而来**：用图中唯一的样本
 * （专业英语听说写II 的金橙 `#eab776` → 实测非本周色 `#d4c3ae`）反推公式——
 * 色相保持不变、HSL 亮度 +0.067、HSL 饱和度 ×0.42；回代该样本可精确复现 `#d4c3ae`，
 * 再按同一公式对 8 组原色逐一推导。不用 CSS 遮罩 / opacity 实现，避免白字一起被淡化。
 */
export const courseOutOfWeekColors = [
  'bg-[#b8d6d1] text-white',
  'bg-[#b3c7d9] text-white',
  'bg-[#bdcae0] text-white',
  'bg-[#dbd6eb] text-white',
  'bg-[#d8b4be] text-white',
  'bg-[#dfcad0] text-white',
  'bg-[#d4b6af] text-white',
  'bg-[#d4c3ae] text-white',
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
