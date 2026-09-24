export const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

export const weekDays = [1, 2, 3, 4, 5, 6, 7]

export const sections = Array.from({ length: 12 }, (_, index) => index + 1)

/**
 * 课表课程格子的 8 组配色。
 *
 * 第四版（2026-09-24 真机三轮反馈后定稿）：平色、白字、无渐变、无阴影。
 * 每格一个「淡而不寡」的中间调（HSB 饱和度 ≤0.5、亮度 0.6–0.7，白字对比 ≥1.9），
 * 颜色退为背景、不喧宾夺主；8 个色相间隔 ≥30°（玫瑰350°/蜜橙20°/鹅黄49°/橄榄90°/
 * 翡翠160°/天空200°/堇紫250°/品红300°），杜绝「深绿浅绿分不清」。
 */
export const courseColors = [
  'bg-[#da8b98] text-white',
  'bg-[#dc9774] text-white',
  'bg-[#c9b458] text-white',
  'bg-[#94bf69] text-white',
  'bg-[#62bc9e] text-white',
  'bg-[#6cafd0] text-white',
  'bg-[#9a8ed7] text-white',
  'bg-[#c87ec8] text-white',
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
