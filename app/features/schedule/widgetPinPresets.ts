import type { WidgetPresetId } from '~/lib/native-widget-snapshot'

/**
 * 应用内「添加到桌面」提供的预设。
 *
 * 一个预设 = **目标格子 + 布局样式 + 大格子表现**。给出预设而不只是「添加小工具」的原因是：
 * 小工具在任何尺寸都能渲染，但只有少数几个尺寸被验证过「内容刚好铺满、不裁切」。预设把这几个尺寸
 * 连同对应的摆法一起推荐给用户，避免用户自己拖出一个没人验证过的尺寸。
 *
 * **标识必须与原生 `WidgetPreset.java` 的白名单逐字一致**（原生只认这几个字符串，拼错会静默回退）。
 * 这条由 `widgetPinPresets.test.ts` 守住。
 */
export type WidgetPinPreset = {
  /** 与原生白名单一致的标识。 */
  id: WidgetPresetId
  /** 卡片标题。 */
  name: string
  /** 目标格子文案，如 `4×3`。 */
  cell: string
  /** 一句话说明这个预设长什么样、适合谁。 */
  description: string
  /** 何时该选它；写在卡片上避免用户逐个试。 */
  hint: string
}

/** 预设清单；顺序就是卡片顺序（从最简到最全）。 */
export const WIDGET_PIN_PRESETS: readonly WidgetPinPreset[] = [
  {
    id: 'phone_minimal',
    name: '手机 · 极简',
    cell: '2×2',
    description: '一张卡突出「现在这节课」，下面跟一行「下一节」。',
    hint: '桌面位置紧张、只想扫一眼现在上什么。',
  },
  {
    id: 'phone_standard',
    name: '手机 · 标准',
    cell: '4×3',
    description: '上面是当前课程，下面接今天整天课表。',
    hint: '最常用的摆法，绝大多数手机桌面。',
  },
  {
    id: 'phone_wide',
    name: '手机 · 宽横',
    cell: '4×2',
    description: '横向铺开、只占两行高度，课表按行滚动。',
    hint: '顶部空间有限，或喜欢横着放。',
  },
  {
    id: 'tablet_dual',
    name: '平板 · 双栏',
    cell: '4×3',
    description: '左栏是当前课程卡片，右栏是今天课表。',
    hint: '平板横屏；字更大、信息更多。',
  },
  {
    id: 'tablet_wide',
    name: '平板 · 宽屏',
    cell: '6×3',
    description: '左卡 + 更宽的右侧课表，教室就在课名下面。',
    hint: '平板横向 6 列以上的宽格。',
  },
]

/**
 * 系统不支持一键添加时的说明。
 *
 * 这段文案必须**如实**：我们只能请求系统去放置，最终尺寸由 launcher 决定，因此不能承诺
 * 「一定会按目标格子放好」。
 */
export const WIDGET_PIN_MANUAL_HINT =
  '当前系统不支持从应用内一键添加。可以长按桌面空白处 → 小工具 → 找到课表 → 拖到桌面上，再按卡片上的格子数调整大小。'

/** 系统弹窗被取消（或 launcher 没有真的放下）时的说明。 */
export const WIDGET_PIN_CANCELLED_HINT = '没有添加成功。可以再点一次，或长按桌面空白处手动添加。'
